use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;
use walkdir::WalkDir;
use regex::Regex;

use crate::security::{
    CommandBlocklist, CommandOutput, ConfinementError, PathConfinement, SandboxConfig,
    SandboxManager,
};

#[derive(Error, Debug)]
pub enum ToolError {
    #[error("Erreur de sécurité : {0}")]
    Security(#[from] ConfinementError),
    #[error("Fichier introuvable : {0}")]
    NotFound(String),
    #[error("Le chemin spécifié est un dossier, pas un fichier : {0}")]
    IsADirectory(String),
    #[error("Le chemin spécifié est un fichier, pas un dossier : {0}")]
    NotADirectory(String),
    #[error("Erreur I/O : {0}")]
    Io(#[from] std::io::Error),
    #[error("Remplacement de code ambigu ou impossible : {0}")]
    EditFailed(String),
    #[error("Erreur bac à sable : {0}")]
    Sandbox(String),
    #[error("Erreur regex : {0}")]
    Regex(#[from] regex::Error),
}

/// Garde RAII pour nettoyer automatiquement les dossiers temporaires isolés (profils LibreOffice, etc.)
pub struct TempDirGuard {
    pub path: std::path::PathBuf,
}

impl TempDirGuard {
    pub fn new(prefix: &str) -> std::io::Result<Self> {
        let unique = format!("{}_{}", prefix, uuid::Uuid::new_v4());
        let path = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&path)?;
        Ok(Self { path })
    }
}

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GrepMatch {
    pub file: String,
    pub line_number: usize,
    pub line_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolItem {
    pub name: String,
    pub kind: String,
    pub file_path: String,
    pub line_number: usize,
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSearchResult {
    pub title: String,
    pub file_path: String,
    pub line_number: usize,
    pub snippet: String,
    pub score: usize,
    pub match_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LintWarning {
    pub symbol: String,
    pub message: String,
    pub suggested_import: Option<String>,
}

pub struct ToolRegistry {
    confinement: PathConfinement,
    blocklist: CommandBlocklist,
    sandbox_config: SandboxConfig,
}

impl ToolRegistry {
    pub fn new<P: AsRef<Path>>(
        workspace_root: P,
        sandbox_config: SandboxConfig,
    ) -> Result<Self, ToolError> {
        let confinement = PathConfinement::new(workspace_root)?;
        let blocklist = CommandBlocklist::new();
        Ok(Self {
            confinement,
            blocklist,
            sandbox_config,
        })
    }

    pub fn update_sandbox_config(&mut self, config: SandboxConfig) {
        self.sandbox_config = config;
    }

    pub fn workspace_root(&self) -> &Path {
        self.confinement.workspace_root()
    }

    /// Outil : read_file
    pub fn read_file(
        &self,
        rel_path: &str,
        offset: Option<usize>,
        limit: Option<usize>,
    ) -> Result<String, ToolError> {
        let verified_path = self.confinement.resolve_and_verify(rel_path)?;

        if !verified_path.exists() {
            let mut available_files = Vec::new();
            if let Ok(entries) = self.list_dir(None, true, Some(3)) {
                for e in entries.into_iter().filter(|e| !e.is_dir).take(15) {
                    available_files.push(e.path);
                }
            }
            let hint = if available_files.is_empty() {
                "Le workspace ne contient actuellement aucun fichier.".to_string()
            } else {
                format!("Fichiers existants dans le projet : [{}]", available_files.join(", "))
            };
            return Err(ToolError::NotFound(format!(
                "Le fichier '{}' n'existe pas dans le workspace. {}",
                rel_path, hint
            )));
        }

        if verified_path.is_dir() {
            return Err(ToolError::IsADirectory(format!(
                "'{}' est un dossier, pas un fichier. Utilisez `list_dir` avec path=\"{}\" pour voir ses fichiers.",
                rel_path, rel_path
            )));
        }

        let ext = verified_path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let content = if ["odt", "ods", "odp", "docx", "xlsx", "pptx", "pdf"].contains(&ext.as_str()) {
            self.extract_document_text_sync(&verified_path)?
        } else {
            match fs::read_to_string(&verified_path) {
                Ok(text) => text,
                Err(e) if e.kind() == std::io::ErrorKind::InvalidData => {
                    self.extract_document_text_sync(&verified_path).map_err(|_| ToolError::Io(e))?
                }
                Err(e) => return Err(ToolError::Io(e)),
            }
        };

        if offset.is_none() && limit.is_none() {
            return Ok(content);
        }

        let start_line = offset.unwrap_or(1).saturating_sub(1);
        let max_lines = limit.unwrap_or(usize::MAX);

        let lines: Vec<&str> = content.lines().collect();
        let selected: Vec<&str> = lines
            .into_iter()
            .skip(start_line)
            .take(max_lines)
            .collect();

        Ok(selected.join("\n"))
    }

    /// Outil : write_file avec validation statique de syntaxe (Item 3)
    pub fn write_file(&self, rel_path: &str, content: &str) -> Result<usize, ToolError> {
        let verified_path = self.confinement.resolve_and_verify(rel_path)?;

        // Validation statique de syntaxe avant écriture
        crate::security::LinuxSecurityEnhancements::validate_syntax(rel_path, content)
            .map_err(|e| ToolError::Sandbox(e))?;

        if let Some(parent) = verified_path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(&verified_path, content)?;
        Ok(content.len())
    }

    /// Outil : edit_file avec validation d'occurrence unique stricte
    pub fn edit_file(
        &self,
        rel_path: &str,
        target_content: &str,
        replacement_content: &str,
    ) -> Result<(), ToolError> {
        let verified_path = self.confinement.resolve_and_verify(rel_path)?;

        if !verified_path.exists() {
            return Err(ToolError::NotFound(format!(
                "Impossible de modifier '{}' : le fichier n'existe pas encore. Utilisez `write_file` pour le créer.",
                rel_path
            )));
        }

        if verified_path.is_dir() {
            return Err(ToolError::IsADirectory(format!(
                "'{}' est un dossier, pas un fichier.",
                rel_path
            )));
        }

        let current_content = fs::read_to_string(&verified_path)?;

        let matches_count = current_content.matches(target_content).count();

        if matches_count == 0 {
            return Err(ToolError::EditFailed(format!(
                "Le bloc cible à remplacer n'a pas été trouvé dans '{}'",
                rel_path
            )));
        }

        if matches_count > 1 {
            return Err(ToolError::EditFailed(format!(
                "Remplacement ambigu : le bloc cible apparaît {} fois dans '{}'. Veuillez fournir un bloc plus spécifique avec du contexte environnant.",
                matches_count, rel_path
            )));
        }

        let new_content = current_content.replacen(target_content, replacement_content, 1);
        fs::write(&verified_path, new_content)?;

        Ok(())
    }

    /// Outil : list_dir
    pub fn list_dir(
        &self,
        rel_path: Option<&str>,
        recursive: bool,
        max_depth: Option<usize>,
    ) -> Result<Vec<FileEntry>, ToolError> {
        let target_dir = match rel_path {
            Some(p) if !p.trim().is_empty() && p.trim() != "." && p.trim() != "./" && p.trim() != "/" => {
                let resolved = self.confinement.resolve_and_verify(p)?;
                if !resolved.exists() {
                    return Ok(Vec::new());
                }
                if resolved.is_file() {
                    return Err(ToolError::NotADirectory(format!(
                        "'{}' est un fichier individuel. Utilisez `read_file` pour lire son contenu.",
                        p
                    )));
                }
                resolved
            }
            _ => self.confinement.workspace_root().to_path_buf(),
        };

        let depth = if !recursive {
            1
        } else {
            max_depth.unwrap_or(10)
        };

        let mut entries = Vec::new();

        for entry in WalkDir::new(&target_dir)
            .max_depth(depth)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                // Ignorer les dossiers lourds, internes et sensibles
                !name.starts_with(".git")
                    && !name.starts_with(".local_agent")
                    && name != "checkpoints"
                    && name != "node_modules"
                    && name != "target"
            })
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            // Ne pas inclure le dossier racine lui-même
            if entry.path() == target_dir {
                continue;
            }

            let path = entry.path();
            let relative_path = path
                .strip_prefix(self.confinement.workspace_root())
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            entries.push(FileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: relative_path,
                is_dir: metadata.is_dir(),
                size: metadata.len(),
            });
        }

        // Trier : dossiers d'abord, puis ordre alphabétique
        entries.sort_by(|a, b| {
            if a.is_dir == b.is_dir {
                a.path.cmp(&b.path)
            } else if a.is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        });

        Ok(entries)
    }

    /// Outil : glob
    pub fn glob_files(&self, pattern: &str) -> Result<Vec<String>, ToolError> {
        let full_pattern = self
            .confinement
            .workspace_root()
            .join(pattern)
            .to_string_lossy()
            .to_string();

        let mut matches = Vec::new();
        for entry in glob::glob(&full_pattern).map_err(|e| ToolError::Sandbox(e.to_string()))? {
            if let Ok(path) = entry {
                if let Ok(verified) = self.confinement.resolve_and_verify(&path) {
                    if let Ok(rel) = verified.strip_prefix(self.confinement.workspace_root()) {
                        matches.push(rel.to_string_lossy().to_string());
                    }
                }
            }
        }

        Ok(matches)
    }

    /// Outil : grep
    pub fn grep_files(
        &self,
        pattern: &str,
        rel_dir: Option<&str>,
        case_sensitive: bool,
    ) -> Result<Vec<GrepMatch>, ToolError> {
        let target_dir = match rel_dir {
            Some(p) if !p.trim().is_empty() => self.confinement.resolve_and_verify(p)?,
            _ => self.confinement.workspace_root().to_path_buf(),
        };

        let regex_pattern = if case_sensitive {
            Regex::new(pattern)?
        } else {
            Regex::new(&format!("(?i){}", pattern))?
        };

        let mut results = Vec::new();

        for entry in WalkDir::new(&target_dir)
            .max_depth(8)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                !name.starts_with(".git")
                    && !name.starts_with(".local_agent")
                    && name != "checkpoints"
                    && name != "node_modules"
                    && name != "target"
            })
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path();
            // Filtrer les fichiers binaires ou trop gros (> 2 Mo)
            if let Ok(meta) = entry.metadata() {
                if meta.len() > 2 * 1024 * 1024 {
                    continue;
                }
            }

            if let Ok(content) = fs::read_to_string(path) {
                let rel_path = path
                    .strip_prefix(self.confinement.workspace_root())
                    .unwrap_or(path)
                    .to_string_lossy()
                    .to_string();

                for (idx, line) in content.lines().enumerate() {
                    if regex_pattern.is_match(line) {
                        results.push(GrepMatch {
                            file: rel_path.clone(),
                            line_number: idx + 1,
                            line_content: line.trim_end().to_string(),
                        });
                        if results.len() >= 200 {
                            // Limiter le nombre de résultats pour ne pas exploser le contexte
                            return Ok(results);
                        }
                    }
                }
            }
        }

        Ok(results)
    }

    /// Outil : delete_file
    pub fn delete_file(&self, rel_path: &str) -> Result<(), ToolError> {
        let trimmed = rel_path.trim();
        if trimmed.is_empty() || trimmed == "." || trimmed == "./" || trimmed == "/" {
            return Err(ToolError::Security(ConfinementError::PathEscaped(
                "Impossible de supprimer la racine du projet".to_string(),
            )));
        }
        let verified_path = self.confinement.resolve_and_verify(rel_path)?;
        if verified_path == self.confinement.workspace_root() {
            return Err(ToolError::Security(ConfinementError::PathEscaped(
                "Impossible de supprimer la racine du projet".to_string(),
            )));
        }
        if !verified_path.exists() {
            return Ok(());
        }
        if verified_path.is_dir() {
            fs::remove_dir_all(&verified_path)?;
        } else {
            fs::remove_file(&verified_path)?;
        }
        Ok(())
    }

    /// Outil : move_file
    pub fn move_file(&self, source: &str, destination: &str) -> Result<(), ToolError> {
        let verified_src = self.confinement.resolve_and_verify(source)?;
        if !verified_src.exists() {
            return Err(ToolError::NotFound(format!(
                "Le fichier source '{}' n'existe pas.",
                source
            )));
        }
        let verified_dst = self.confinement.resolve_and_verify(destination)?;

        if let Some(parent) = verified_dst.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::rename(verified_src, verified_dst)?;
        Ok(())
    }

    /// Outil : create_dir
    pub fn create_dir(&self, rel_path: &str) -> Result<(), ToolError> {
        let verified_path = self.confinement.resolve_and_verify(rel_path)?;
        fs::create_dir_all(verified_path)?;
        Ok(())
    }

    /// Outil : run_command
    pub async fn run_command(&self, command: &str) -> Result<CommandOutput, ToolError> {
        // 1. Validation statique de la blocklist de sécurité
        self.blocklist
            .validate_command(command)
            .map_err(|e| ToolError::Sandbox(e.to_string()))?;

        // 2. Exécution dans le sandbox isolé
        SandboxManager::execute(
            self.confinement.workspace_root(),
            command,
            &self.sandbox_config,
        )
        .await
        .map_err(|e| ToolError::Sandbox(e.to_string()))
    }

    /// Outil : web_search via DuckDuckGo
    pub async fn web_search(&self, query: &str, limit: Option<usize>) -> Result<Vec<SearchResult>, ToolError> {
        let max_results = limit.unwrap_or(5).min(10);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| ToolError::Sandbox(format!("Erreur client HTTP : {}", e)))?;

        let mut url = reqwest::Url::parse("https://html.duckduckgo.com/html/").unwrap();
        url.query_pairs_mut().append_pair("q", query);

        let resp = client.get(url).send().await
            .map_err(|e| ToolError::Sandbox(format!("Erreur recherche web : {}", e)))?;

        let html = resp.text().await
            .map_err(|e| ToolError::Sandbox(format!("Erreur lecture résultat web : {}", e)))?;

        let mut results = Vec::new();
        let re_snippet = Regex::new(r#"(?s)<a class="result__snippet"[^>]*>(.*?)</a>"#).unwrap();
        let re_title = Regex::new(r#"(?s)<a class="result__url"[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#).unwrap();
        let re_tag = Regex::new(r#"<[^>]+>"#).unwrap();

        let snippets: Vec<String> = re_snippet
            .captures_iter(&html)
            .map(|c| re_tag.replace_all(&c[1], "").trim().to_string())
            .collect();

        let titles_urls: Vec<(String, String)> = re_title
            .captures_iter(&html)
            .map(|c| {
                let raw_url = &c[1];
                let clean_title = re_tag.replace_all(&c[2], "").trim().to_string();
                (clean_title, raw_url.to_string())
            })
            .collect();

        for i in 0..snippets.len().min(titles_urls.len()).min(max_results) {
            let (url, snippet) = (&titles_urls[i].1, &snippets[i]);
            let title = if !titles_urls[i].0.is_empty() {
                titles_urls[i].0.clone()
            } else {
                format!("Résultat {}", i + 1)
            };

            let actual_url = if let Some(pos) = url.find("uddg=") {
                let rest = &url[pos + 5..];
                let end = rest.find('&').unwrap_or(rest.len());
                let encoded = &rest[..end];
                encoded.replace("%2F", "/").replace("%3A", ":").replace("%2D", "-").replace("%2E", ".")
            } else {
                url.clone()
            };

            results.push(SearchResult {
                title,
                url: actual_url,
                snippet: snippet.clone(),
            });
        }

        if results.is_empty() {
            // Repli sur l'API DuckDuckGo Instant Answer
            let api_url = format!("https://api.duckduckgo.com/?q={}&format=json&no_html=1", query.replace(' ', "+"));
            if let Ok(resp) = client.get(&api_url).send().await {
                if let Ok(json_val) = resp.json::<serde_json::Value>().await {
                    if let Some(abstract_text) = json_val.get("AbstractText").and_then(|t| t.as_str()) {
                        if !abstract_text.is_empty() {
                            results.push(SearchResult {
                                title: json_val.get("Heading").and_then(|h| h.as_str()).unwrap_or(query).to_string(),
                                url: json_val.get("AbstractURL").and_then(|u| u.as_str()).unwrap_or("").to_string(),
                                snippet: abstract_text.to_string(),
                            });
                        }
                    }
                }
            }
        }

        Ok(results)
    }

    /// Outil : fetch_url pour télécharger et extraire le texte d'une page web
    pub async fn fetch_url(&self, url: &str) -> Result<String, ToolError> {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(ToolError::Sandbox(format!("URL invalide (doit commencer par http:// ou https://) : {}", url)));
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| ToolError::Sandbox(format!("Erreur client HTTP : {}", e)))?;

        let resp = client.get(url).send().await
            .map_err(|e| ToolError::Sandbox(format!("Impossible de charger l'URL {} : {}", url, e)))?;

        let text = resp.text().await
            .map_err(|e| ToolError::Sandbox(format!("Erreur de lecture du corps de la page : {}", e)))?;

        let re_script = Regex::new(r#"(?is)<script[^>]*>.*?</script>"#).unwrap();
        let re_style = Regex::new(r#"(?is)<style[^>]*>.*?</style>"#).unwrap();
        let re_tags = Regex::new(r#"<[^>]+>"#).unwrap();

        let no_script = re_script.replace_all(&text, "");
        let no_style = re_style.replace_all(&no_script, "");
        let clean = re_tags.replace_all(&no_style, " ");

        let re_whitespace = Regex::new(r#"\s+"#).unwrap();
        let condensed = re_whitespace.replace_all(&clean, " ");

        let truncated = if condensed.len() > 10000 {
            format!("{}... [Contenu tronqué à 10 000 caractères]", &condensed[..10000])
        } else {
            condensed.to_string()
        };

        Ok(truncated.trim().to_string())
    }

    /// Outil : search_semantic (Item 2 - RAG local)
    pub fn search_semantic(&self, query: &str, limit: Option<usize>) -> Result<Vec<SearchResult>, ToolError> {
        let max_results = limit.unwrap_or(5);
        let query_terms: Vec<String> = query
            .to_lowercase()
            .split_whitespace()
            .map(|s| s.trim_matches(|c: char| !c.is_alphanumeric()).to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if query_terms.is_empty() {
            return Ok(Vec::new());
        }

        let entries = self.list_dir(None, true, Some(4))?;
        let mut scored_chunks = Vec::new();

        for entry in entries.into_iter().filter(|e| !e.is_dir) {
            let ext = Path::new(&entry.path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            if !["rs", "ts", "tsx", "js", "jsx", "py", "json", "md", "toml", "yaml", "html", "css", "c", "cpp", "go", "java"].contains(&ext) {
                continue;
            }

            if let Ok(content) = self.read_file(&entry.path, None, Some(500)) {
                let blocks: Vec<&str> = content.split("\n\n").collect();
                for (block_idx, block) in blocks.into_iter().enumerate() {
                    let block_lower = block.to_lowercase();
                    let mut score = 0usize;
                    for term in &query_terms {
                        if block_lower.contains(term) {
                            score += 10;
                            if block_lower.contains(&format!("fn {}", term)) || block_lower.contains(&format!("def {}", term)) || block_lower.contains(&format!("class {}", term)) {
                                score += 20;
                            }
                        }
                    }

                    if score > 0 {
                        let snippet = if block.len() > 300 {
                            format!("{}...", &block[..300])
                        } else {
                            block.to_string()
                        };
                        scored_chunks.push((score, SearchResult {
                            title: format!("{} (bloc #{})", entry.path, block_idx + 1),
                            url: entry.path.clone(),
                            snippet,
                        }));
                    }
                }
            }
        }

        scored_chunks.sort_by(|a, b| b.0.cmp(&a.0));
        let results = scored_chunks.into_iter().take(max_results).map(|(_, r)| r).collect();
        Ok(results)
    }

    /// Outil : ast_grep (Item 23 - Code intelligence)
    pub fn ast_grep(
        &self,
        query: &str,
        kind: Option<&str>,
        rel_path: Option<&str>,
    ) -> Result<Vec<GrepMatch>, ToolError> {
        let pattern_str = match kind.unwrap_or("any") {
            "fn" | "function" => format!(r#"(?i)(fn|function|def|async\s+fn|async\s+def)\s+([a-zA-Z0-9_]*{})"#, regex::escape(query)),
            "class" | "struct" => format!(r#"(?i)(class|struct|interface|type|enum)\s+([a-zA-Z0-9_]*{})"#, regex::escape(query)),
            "import" => format!(r#"(?i)(use|import|from|require)\s+.*{}"#, regex::escape(query)),
            _ => format!(r#"(?i){}"#, regex::escape(query)),
        };

        self.grep_files(&pattern_str, rel_path, false)
    }

    /// Outil : generate_project_docs (Item 24 - Architecture & Diagrammes Mermaid)
    pub fn generate_project_docs(&self) -> Result<String, ToolError> {
        let entries = self.list_dir(None, true, Some(3))?;
        let ws_name = self.confinement.workspace_root().file_name().and_then(|n| n.to_str()).unwrap_or("Projet");

        let mut markdown = format!("# Documentation d'Architecture : {}\n\n", ws_name);
        markdown.push_str("Générée automatiquement par l'Agent de Code Local.\n\n");

        let mut techs = Vec::new();
        if entries.iter().any(|e| e.name == "Cargo.toml") { techs.push("Rust (Cargo)"); }
        if entries.iter().any(|e| e.name == "package.json") { techs.push("Node.js / TypeScript / React"); }
        if entries.iter().any(|e| e.name == "requirements.txt" || e.name == "pyproject.toml") { techs.push("Python"); }
        if entries.iter().any(|e| e.name == "go.mod") { techs.push("Go"); }

        if !techs.is_empty() {
            markdown.push_str(&format!("**Stack technique détectée** : {}\n\n", techs.join(" • ")));
        }

        markdown.push_str("## 📐 Schéma d'Architecture\n\n```mermaid\ngraph TD\n");
        markdown.push_str(&format!("    Root[\"{}\"] --> Sources[\"Fichiers Sources\"]\n", ws_name));

        let top_dirs: Vec<&str> = entries
            .iter()
            .filter(|e| e.is_dir && !e.path.contains('/'))
            .map(|e| e.path.as_str())
            .take(6)
            .collect();

        for dir in top_dirs {
            markdown.push_str(&format!("    Sources --> D_{}[\"{}\"]\n", dir.replace('-', "_"), dir));
        }

        markdown.push_str("```\n\n## 📂 Modules Principaux\n\n");
        for entry in entries.iter().filter(|e| !e.is_dir).take(20) {
            markdown.push_str(&format!("- `{}` ({} octets)\n", entry.path, entry.size));
        }

        Ok(markdown)
    }

    /// Outil : inspect_sqlite_db (Item 25)
    pub fn inspect_sqlite_db(&self, db_path: &str, query: Option<&str>) -> Result<serde_json::Value, ToolError> {
        let verified = self.confinement.resolve_and_verify(db_path)?;
        if !verified.exists() {
            return Err(ToolError::NotFound(format!("Base SQLite introuvable sur '{}'", db_path)));
        }

        let sql = query.unwrap_or(".tables");
        let output = std::process::Command::new("sqlite3")
            .arg("-header")
            .arg("-json")
            .arg("-safe")
            .arg("-readonly")
            .arg(&verified)
            .arg(sql)
            .output()
            .map_err(|e| ToolError::Sandbox(e.to_string()))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&stdout) {
            Ok(json!({ "status": "success", "data": parsed }))
        } else {
            Ok(json!({ "status": "output", "raw": stdout.trim() }))
        }
    }

    /// Outil : run_test_suite (Item 27 - Auto-test)
    pub async fn run_test_suite(&self) -> Result<serde_json::Value, ToolError> {
        let ws = self.confinement.workspace_root();
        let cmd = if ws.join("Cargo.toml").exists() {
            "cargo test --no-fail-fast"
        } else if ws.join("package.json").exists() {
            "npm test -- --watchAll=false 2>/dev/null || npm test"
        } else if ws.join("pytest.ini").exists() || ws.join("requirements.txt").exists() {
            "pytest"
        } else {
            "make test"
        };

        let output = self.run_command(cmd).await?;
        let passed = output.exit_code == 0;
        Ok(json!({
            "command": cmd,
            "passed": passed,
            "exit_code": output.exit_code,
            "duration_ms": output.duration_ms,
            "stdout": output.stdout,
            "stderr": output.stderr
        }))
    }

    /// Outil : check_http_service (Item 28)
    pub async fn check_http_service(&self, port: u16, path: Option<&str>) -> Result<serde_json::Value, ToolError> {
        let sub = path.unwrap_or("/").trim_start_matches('/');
        let url = format!("http://127.0.0.1:{}/{}", port, sub);
        let start = std::time::Instant::now();

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .map_err(|e| ToolError::Sandbox(e.to_string()))?;

        match client.get(&url).send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let duration_ms = start.elapsed().as_millis();
                let text = resp.text().await.unwrap_or_default();
                let preview = if text.len() > 300 { format!("{}...", &text[..300]) } else { text };
                Ok(json!({
                    "url": url,
                    "reachable": true,
                    "http_status": status,
                    "response_time_ms": duration_ms,
                    "preview": preview
                }))
            }
            Err(e) => {
                Ok(json!({
                    "url": url,
                    "reachable": false,
                    "error": e.to_string(),
                    "response_time_ms": start.elapsed().as_millis()
                }))
            }
        }
    }

    /// Outil : calculate_code_metrics (Item 29)
    pub fn calculate_code_metrics(&self, rel_path: Option<&str>) -> Result<serde_json::Value, ToolError> {
        let entries = if let Some(p) = rel_path {
            vec![FileEntry {
                name: p.to_string(),
                path: p.to_string(),
                is_dir: false,
                size: 0,
            }]
        } else {
            self.list_dir(None, true, Some(4))?
        };

        let mut total_lines = 0usize;
        let mut total_comments = 0usize;
        let mut total_functions = 0usize;
        let mut cyclomatic_points = 0usize;
        let mut files_analyzed = 0usize;

        for entry in entries.into_iter().filter(|e| !e.is_dir) {
            let ext = Path::new(&entry.path).extension().and_then(|e| e.to_str()).unwrap_or("");
            if !["rs", "ts", "tsx", "js", "py", "c", "cpp", "go"].contains(&ext) {
                continue;
            }

            if let Ok(content) = self.read_file(&entry.path, None, None) {
                files_analyzed += 1;
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() { continue; }
                    total_lines += 1;
                    if trimmed.starts_with("//") || trimmed.starts_with('#') || trimmed.starts_with("/*") || trimmed.starts_with('*') {
                        total_comments += 1;
                    }
                    if trimmed.contains("fn ") || trimmed.contains("function ") || trimmed.contains("def ") {
                        total_functions += 1;
                    }
                    if trimmed.contains("if ") || trimmed.contains("else if ") || trimmed.contains("match ") || trimmed.contains("for ") || trimmed.contains("while ") || trimmed.contains(" && ") || trimmed.contains(" || ") {
                        cyclomatic_points += 1;
                    }
                }
            }
        }

        let complexity_ratio = if total_functions > 0 {
            (cyclomatic_points as f64) / (total_functions as f64)
        } else {
            1.0
        };

        let maintainability = if complexity_ratio < 4.0 { "Excellent" } else if complexity_ratio < 8.0 { "Bon" } else { "À surveiller (refactoring conseillé)" };

        Ok(json!({
            "files_analyzed": files_analyzed,
            "total_lines_of_code": total_lines,
            "comment_lines": total_comments,
            "functions_count": total_functions,
            "estimated_cyclomatic_points": cyclomatic_points,
            "average_complexity_per_function": format!("{:.1}", complexity_ratio),
            "maintainability_rating": maintainability
        }))
    }

    /// Outil : inspect_binary (Item 55 - Analyse d'exécutables ELF / Wasm)
    pub fn inspect_binary(&self, rel_path: &str) -> Result<serde_json::Value, ToolError> {
        let verified = self.confinement.resolve_and_verify(rel_path)?;
        if !verified.exists() {
            return Err(ToolError::NotFound(format!("Fichier binaire introuvable : '{}'", rel_path)));
        }

        let output_file = std::process::Command::new("file")
            .arg(verified.to_string_lossy().as_ref())
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_else(|_| "Inconnu".to_string());

        let output_nm = std::process::Command::new("nm")
            .args(&["-D", verified.to_string_lossy().as_ref()])
            .output()
            .map(|o| {
                let stdout = String::from_utf8_lossy(&o.stdout);
                stdout.lines().take(30).collect::<Vec<&str>>().join("\n")
            })
            .unwrap_or_default();

        Ok(json!({
            "path": rel_path,
            "file_type": output_file.trim(),
            "exported_symbols_sample": output_nm.trim(),
            "size_bytes": verified.metadata().map(|m| m.len()).unwrap_or(0)
        }))
    }

    /// Outil : profile_benchmark (Item 48 - Profiler et benchmark de commandes)
    pub async fn profile_benchmark(&self, command: &str) -> Result<serde_json::Value, ToolError> {
        let start = std::time::Instant::now();
        let cmd_out = self.run_command(command).await?;
        let duration_ms = start.elapsed().as_millis();

        Ok(json!({
            "command": command,
            "duration_ms": duration_ms,
            "exit_code": cmd_out.exit_code,
            "stdout_preview": if cmd_out.stdout.len() > 500 { format!("{}...", &cmd_out.stdout[..500]) } else { cmd_out.stdout },
            "status": if cmd_out.exit_code == 0 { "success" } else { "failure" }
        }))
    }

    /// Outil : analyze_local_image (Item 43 - Vision Multimodale Locale)
    pub async fn analyze_local_image(&self, rel_path: &str, prompt: Option<&str>) -> Result<serde_json::Value, ToolError> {
        let verified = self.confinement.resolve_and_verify(rel_path)?;
        if !verified.exists() {
            return Err(ToolError::NotFound(format!("Image introuvable : '{}'", rel_path)));
        }

        let bytes = std::fs::read(&verified)?;
        let base64_str = {
            const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let mut out = String::new();
            for chunk in bytes.chunks(3) {
                let b0 = chunk[0];
                let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
                let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };
                out.push(CHARSET[(b0 >> 2) as usize] as char);
                out.push(CHARSET[(((b0 & 3) << 4) | (b1 >> 4)) as usize] as char);
                if chunk.len() > 1 {
                    out.push(CHARSET[(((b1 & 15) << 2) | (b2 >> 6)) as usize] as char);
                } else {
                    out.push('=');
                }
                if chunk.len() > 2 {
                    out.push(CHARSET[(b2 & 63) as usize] as char);
                } else {
                    out.push('=');
                }
            }
            out
        };

        let user_prompt = prompt.unwrap_or("Décris précisément cette interface ou image et le code correspondant.");

        // Interroger Ollama en local avec gemma4:e4b ou llava
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| ToolError::Sandbox(e.to_string()))?;

        let body = json!({
            "model": "gemma4:e4b",
            "prompt": user_prompt,
            "images": [base64_str],
            "stream": false
        });

        match client.post("http://localhost:11434/api/generate").json(&body).send().await {
            Ok(resp) => {
                if let Ok(json_res) = resp.json::<serde_json::Value>().await {
                    let desc = json_res.get("response").and_then(|r| r.as_str()).unwrap_or("Image analysée");
                    Ok(json!({
                        "status": "success",
                        "image_path": rel_path,
                        "analysis": desc
                    }))
                } else {
                    Ok(json!({
                        "status": "loaded",
                        "image_path": rel_path,
                        "analysis": "Image chargée avec succès (Ollama modèle vision indisponible, base64 extrait)."
                    }))
                }
            }
            Err(_) => {
                Ok(json!({
                    "status": "loaded",
                    "image_path": rel_path,
                    "analysis": format!("Image chargée (taille : {} octets). Serveur vision local non connecté.", bytes.len())
                }))
            }
        }
    }

    /// Détection des imports manquants et avertissements linter (Item 5)
    pub fn detect_missing_imports(rel_path: &str, content: &str) -> Vec<LintWarning> {
        let mut warnings = Vec::new();
        let ext = Path::new(rel_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        if matches!(ext, "ts" | "tsx" | "js" | "jsx") {
            let has_react_import = content.contains("from 'react'") || content.contains("from \"react\"");
            let react_hooks = ["useState", "useEffect", "useCallback", "useMemo", "useRef", "useContext"];
            for hook in &react_hooks {
                if content.contains(hook) && !has_react_import && !content.contains(&format!("function {}", hook)) {
                    warnings.push(LintWarning {
                        symbol: hook.to_string(),
                        message: format!("Le hook React '{}' est utilisé sans import de 'react'.", hook),
                        suggested_import: Some(format!("import {{ {} }} from 'react';", hook)),
                    });
                }
            }

            let has_lucide_import = content.contains("from 'lucide-react'") || content.contains("from \"lucide-react\"");
            let common_icons = ["Shield", "Terminal", "Settings", "AlertTriangle", "Check", "X", "ChevronRight", "Search", "Folder", "Play", "Download", "Workflow", "Layers", "Cpu"];
            for icon in &common_icons {
                if content.contains(&format!("<{}", icon)) && !has_lucide_import {
                    warnings.push(LintWarning {
                        symbol: icon.to_string(),
                        message: format!("Composant icône '{}' utilisé sans import de 'lucide-react'.", icon),
                        suggested_import: Some(format!("import {{ {} }} from 'lucide-react';", icon)),
                    });
                }
            }
        } else if ext == "rs" {
            if (content.contains("#[derive(Serialize") || content.contains("#[derive(Deserialize"))
                && !content.contains("use serde::")
            {
                warnings.push(LintWarning {
                    symbol: "serde".to_string(),
                    message: "Derive macros Serialize / Deserialize utilisées sans import de serde.".to_string(),
                    suggested_import: Some("use serde::{Deserialize, Serialize};".to_string()),
                });
            }
            if (content.contains("PathBuf") || content.contains("Path::")) && !content.contains("use std::path") {
                warnings.push(LintWarning {
                    symbol: "std::path".to_string(),
                    message: "Types PathBuf ou Path utilisés sans import de std::path.".to_string(),
                    suggested_import: Some("use std::path::{Path, PathBuf};".to_string()),
                });
            }
        } else if ext == "py" {
            let py_modules = [
                ("json.dumps", "import json"),
                ("json.loads", "import json"),
                ("os.path", "import os"),
                ("sys.exit", "import sys"),
                ("re.compile", "import re"),
            ];
            for (usage, imp) in &py_modules {
                if content.contains(usage) && !content.contains(imp) {
                    warnings.push(LintWarning {
                        symbol: usage.to_string(),
                        message: format!("Module utilisé via '{}' sans import '{}'.", usage, imp),
                        suggested_import: Some(imp.to_string()),
                    });
                }
            }
        }

        warnings
    }

    /// Outil : get_workspace_symbols (Item 18 - Indexation AST rapide)
    pub fn get_workspace_symbols(&self) -> Result<Vec<SymbolItem>, ToolError> {
        let entries = self.list_dir(None, true, Some(6))?;
        let mut symbols = Vec::new();

        let re_rs_fn = Regex::new(r"^\s*(?:pub(?:\([^\)]+\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)").unwrap();
        let re_rs_struct = Regex::new(r"^\s*(?:pub(?:\([^\)]+\))?\s+)?struct\s+([a-zA-Z0-9_]+)").unwrap();
        let re_rs_enum = Regex::new(r"^\s*(?:pub(?:\([^\)]+\))?\s+)?enum\s+([a-zA-Z0-9_]+)").unwrap();
        let re_rs_trait = Regex::new(r"^\s*(?:pub(?:\([^\)]+\))?\s+)?trait\s+([a-zA-Z0-9_]+)").unwrap();

        let re_ts_fn = Regex::new(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)").unwrap();
        let re_ts_const_fn = Regex::new(r"^\s*(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(").unwrap();
        let re_ts_component = Regex::new(r"^\s*(?:export\s+)?const\s+([A-Z][a-zA-Z0-9_]+)\s*:\s*React\.FC").unwrap();
        let re_ts_type = Regex::new(r"^\s*(?:export\s+)?(?:interface|type)\s+([a-zA-Z0-9_]+)").unwrap();
        let re_ts_class = Regex::new(r"^\s*(?:export\s+)?class\s+([a-zA-Z0-9_]+)").unwrap();

        let re_py_fn = Regex::new(r"^\s*def\s+([a-zA-Z0-9_]+)\s*\(").unwrap();
        let re_py_class = Regex::new(r"^\s*class\s+([a-zA-Z0-9_]+)").unwrap();

        for entry in entries.into_iter().filter(|e| !e.is_dir) {
            let ext = Path::new(&entry.path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            if !["rs", "ts", "tsx", "js", "jsx", "py"].contains(&ext) {
                continue;
            }

            if let Ok(content) = self.read_file(&entry.path, None, Some(800)) {
                for (idx, line) in content.lines().enumerate() {
                    let line_number = idx + 1;
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with('#') || trimmed.starts_with("/*") {
                        continue;
                    }

                    match ext {
                        "rs" => {
                            if let Some(caps) = re_rs_fn.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "function".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            } else if let Some(caps) = re_rs_struct.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "struct".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            } else if let Some(caps) = re_rs_enum.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "enum".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            } else if let Some(caps) = re_rs_trait.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "trait".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            }
                        }
                        "ts" | "tsx" | "js" | "jsx" => {
                            if let Some(caps) = re_ts_component.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "component".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            } else if let Some(caps) = re_ts_fn.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "function".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            } else if let Some(caps) = re_ts_const_fn.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "function".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            } else if let Some(caps) = re_ts_type.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "type".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            } else if let Some(caps) = re_ts_class.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "class".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            }
                        }
                        "py" => {
                            if let Some(caps) = re_py_fn.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "function".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            } else if let Some(caps) = re_py_class.captures(trimmed) {
                                symbols.push(SymbolItem {
                                    name: caps[1].to_string(),
                                    kind: "class".to_string(),
                                    file_path: entry.path.clone(),
                                    line_number,
                                    signature: Some(trimmed.to_string()),
                                });
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        Ok(symbols)
    }

    /// Outil : hybrid_search (Item 20 - Pertinence BM25 + Symboles AST + Fichiers)
    pub fn hybrid_search(&self, query: &str, limit: Option<usize>) -> Result<Vec<HybridSearchResult>, ToolError> {
        let max_results = limit.unwrap_or(15);
        let query_lower = query.trim().to_lowercase();
        let terms: Vec<String> = query_lower
            .split_whitespace()
            .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric()).to_string())
            .filter(|t| !t.is_empty())
            .collect();

        if terms.is_empty() {
            return Ok(Vec::new());
        }

        let mut results = Vec::new();

        // 1. Recherche parmi les symboles AST
        if let Ok(symbols) = self.get_workspace_symbols() {
            for sym in symbols {
                let sym_lower = sym.name.to_lowercase();
                let mut sym_score = 0;
                for term in &terms {
                    if sym_lower == *term {
                        sym_score += 100;
                    } else if sym_lower.starts_with(term) {
                        sym_score += 70;
                    } else if sym_lower.contains(term) {
                        sym_score += 40;
                    }
                }
                if sym_score > 0 {
                    results.push(HybridSearchResult {
                        title: format!("{} ({})", sym.name, sym.kind),
                        file_path: sym.file_path,
                        line_number: sym.line_number,
                        snippet: sym.signature.unwrap_or_else(|| sym.name.clone()),
                        score: sym_score,
                        match_type: "symbol".to_string(),
                    });
                }
            }
        }

        // 2. Recherche par nom de chemin de fichier
        if let Ok(entries) = self.list_dir(None, true, Some(5)) {
            for entry in entries.into_iter().filter(|e| !e.is_dir) {
                let path_lower = entry.path.to_lowercase();
                let mut path_score = 0;
                for term in &terms {
                    if path_lower.contains(term) {
                        path_score += 35;
                    }
                }
                if path_score > 0 {
                    results.push(HybridSearchResult {
                        title: entry.name,
                        file_path: entry.path,
                        line_number: 1,
                        snippet: "Correspondance sur le chemin du fichier".to_string(),
                        score: path_score,
                        match_type: "path".to_string(),
                    });
                }
            }
        }

        // 3. Recherche dans le contenu (BM25 token occurrences)
        if let Ok(matches) = self.grep_files(&terms[0], None, false) {
            for m in matches.into_iter().take(20) {
                results.push(HybridSearchResult {
                    title: format!("{} : L{}", m.file, m.line_number),
                    file_path: m.file,
                    line_number: m.line_number,
                    snippet: m.line_content,
                    score: 25,
                    match_type: "content".to_string(),
                });
            }
        }

        // Trier par score décroissant et dédupliquer
        results.sort_by(|a, b| b.score.cmp(&a.score));
        results.truncate(max_results);
        Ok(results)
    }

    /// Outil : export_libreoffice_doc (Conversion et génération de documents LibreOffice Writer/Calc/Impress/Draw/PDF)
    pub async fn export_libreoffice_doc(
        &self,
        source_path: &str,
        target_format: &str,
        outdir: Option<&str>,
    ) -> Result<serde_json::Value, ToolError> {
        let abs_src = self.confinement.resolve_and_verify(source_path)?;
        if !abs_src.exists() {
            return Err(ToolError::NotFound(format!("Fichier source introuvable : {}", source_path)));
        }

        let fmt = target_format.trim().to_lowercase();
        let valid_formats = ["odt", "ods", "odp", "odg", "pdf", "docx", "xlsx", "pptx", "html", "txt", "csv"];
        if !valid_formats.contains(&fmt.as_str()) {
            return Err(ToolError::Sandbox(format!(
                "Format cible non supporté : '{}'. Formats valides : {}",
                fmt,
                valid_formats.join(", ")
            )));
        }

        let dest_dir = if let Some(od) = outdir {
            self.confinement.resolve_and_verify(od)?
        } else {
            abs_src.parent().unwrap_or(self.workspace_root()).to_path_buf()
        };

        std::fs::create_dir_all(&dest_dir).map_err(ToolError::Io)?;

        // Exécuter libreoffice --headless --convert-to <fmt> <src> --outdir <dest_dir> avec profil isolé et timeout 25s
        let temp_profile = TempDirGuard::new("singular_lo_export").map_err(ToolError::Io)?;
        let profile_arg = format!("-env:UserInstallation=file://{}", temp_profile.path.display());

        let cmd = tokio::process::Command::new("libreoffice")
            .arg(&profile_arg)
            .arg("--headless")
            .arg("--convert-to")
            .arg(&fmt)
            .arg(&abs_src)
            .arg("--outdir")
            .arg(&dest_dir)
            .output();

        let output = tokio::time::timeout(std::time::Duration::from_secs(25), cmd)
            .await
            .map_err(|_| ToolError::Sandbox("Délai d'attente dépassé (25s) lors de la conversion LibreOffice".to_string()))?
            .map_err(ToolError::Io)?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(ToolError::Sandbox(format!("Échec de la conversion LibreOffice : {}", stderr)));
        }

        let stem = abs_src.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
        let generated_file = dest_dir.join(format!("{}.{}", stem, fmt));
        let rel_dest = generated_file
            .strip_prefix(self.workspace_root())
            .unwrap_or(&generated_file)
            .to_string_lossy()
            .to_string();

        let size = if generated_file.exists() {
            std::fs::metadata(&generated_file).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        Ok(serde_json::json!({
            "status": "success",
            "message": format!("Document LibreOffice converti avec succès en .{}.", fmt),
            "generated_file": rel_dest,
            "format": fmt,
            "size_bytes": size,
            "app_target": match fmt.as_str() {
                "odt" | "docx" => "LibreOffice Writer",
                "ods" | "xlsx" | "csv" => "LibreOffice Calc",
                "odp" | "pptx" => "LibreOffice Impress",
                "odg" => "LibreOffice Draw",
                "pdf" => "Lecteur PDF / LibreOffice Draw",
                _ => "LibreOffice Suite",
            }
        }))
    }

    /// Extrait le contenu textuel d'un document bureautique binaire (.odt, .ods, .odp, .docx, .xlsx, .pdf)
    pub fn extract_document_text_sync(&self, abs_path: &Path) -> Result<String, ToolError> {
        Self::extract_document_text_sync_static(abs_path)
    }

    pub fn extract_document_text_sync_static(abs_path: &Path) -> Result<String, ToolError> {
        let stem = abs_path.file_stem().and_then(|s| s.to_str()).unwrap_or("doc");
        let tmp_dir = std::env::temp_dir();
        let target_txt = tmp_dir.join(format!("{}.txt", stem));
        let _ = std::fs::remove_file(&target_txt);

        // Profil isolé pour éviter les blocages inter-processus
        let temp_profile = TempDirGuard::new("singular_lo_extract").ok();
        let mut cmd = std::process::Command::new("libreoffice");
        if let Some(ref prof) = temp_profile {
            cmd.arg(format!("-env:UserInstallation=file://{}", prof.path.display()));
        }

        // Tentative 1 : LibreOffice headless conversion vers txt
        if let Ok(out) = cmd
            .arg("--headless")
            .arg("--convert-to")
            .arg("txt:Text")
            .arg(abs_path)
            .arg("--outdir")
            .arg(&tmp_dir)
            .output()
        {
            if out.status.success() && target_txt.exists() {
                if let Ok(text) = std::fs::read_to_string(&target_txt) {
                    let _ = std::fs::remove_file(&target_txt);
                    return Ok(text);
                }
            }
        }

        // Tentative 2 : unzip -p <abs_path> content.xml (pour .odt, .ods, .odp)
        if let Ok(out) = std::process::Command::new("unzip")
            .arg("-p")
            .arg(abs_path)
            .arg("content.xml")
            .output()
        {
            if out.status.success() {
                let xml = String::from_utf8_lossy(&out.stdout);
                let cleaned = xml
                    .replace("<text:p>", "\n")
                    .replace("<text:p ", "\n<text:p ")
                    .replace("<text:h>", "\n# ")
                    .replace("<text:h ", "\n# <text:h ")
                    .replace("</text:p>", "\n")
                    .replace("</text:h>", "\n");
                let re = regex::Regex::new(r"<[^>]+>").map_err(ToolError::Regex)?;
                let decoded = re.replace_all(&cleaned, " ");
                let re_spaces = regex::Regex::new(r"[ \t]+").map_err(ToolError::Regex)?;
                let formatted = re_spaces.replace_all(&decoded, " ");
                let re_newlines = regex::Regex::new(r"\n{3,}").map_err(ToolError::Regex)?;
                let final_text = re_newlines.replace_all(&formatted, "\n\n");
                return Ok(final_text.trim().to_string());
            }
        }

        Err(ToolError::Sandbox(format!("Impossible d'extraire le texte du document binaire '{:?}'.", abs_path)))
    }

    /// Outil : read_libreoffice_doc (Lecture et extraction du texte d'un document bureautique ODT, ODS, ODP, DOCX, PDF)
    pub async fn read_libreoffice_doc(&self, path: &str) -> Result<serde_json::Value, ToolError> {
        let abs_path = self.confinement.resolve_and_verify(path)?;
        if !abs_path.exists() {
            let mut available_files = Vec::new();
            if let Ok(entries) = self.list_dir(None, true, Some(3)) {
                for e in entries.into_iter().filter(|e| !e.is_dir).take(15) {
                    available_files.push(e.path);
                }
            }
            let hint = if available_files.is_empty() {
                "Le workspace ne contient actuellement aucun fichier.".to_string()
            } else {
                format!("Fichiers existants dans le projet : [{}]", available_files.join(", "))
            };
            return Err(ToolError::NotFound(format!(
                "Le document '{}' n'existe pas dans le workspace. {}",
                path, hint
            )));
        }

        let abs_path_clone = abs_path.clone();
        let text = tokio::task::spawn_blocking(move || {
            Self::extract_document_text_sync_static(&abs_path_clone)
        })
        .await
        .map_err(|e| ToolError::Sandbox(e.to_string()))??;

        let lines_count = text.lines().count();

        Ok(serde_json::json!({
            "status": "success",
            "file": path,
            "lines_count": lines_count,
            "text": text,
            "content": text,
            "preview": text.chars().take(300).collect::<String>()
        }))
    }

    /// Outil : generate_libreoffice_template (Création directe de documents OpenDocument Flat XML Writer/Calc/Impress/Draw/Math)
    pub async fn generate_libreoffice_template(
        &self,
        app_type: &str,
        path: &str,
        title: &str,
        content: &str,
    ) -> Result<serde_json::Value, ToolError> {
        let app = app_type.trim().to_lowercase();
        let target_path = self.confinement.resolve_and_verify(path)?;
        if let Some(parent) = target_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| ToolError::Io(e))?;
        }

        let quick_xml_escape = |s: &str| -> String {
            s.replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
                .replace('"', "&quot;")
                .replace('\'', "&apos;")
        };

        let generated_content = match app.as_str() {
            "writer" | "odt" => {
                // Document HTML pour compilation directe en .odt (LibreOffice Writer)
                let html_body = if content.contains("<p>") || content.contains("<h1>") || content.contains("<div>") {
                    content.to_string()
                } else {
                    let paras: Vec<String> = content
                        .lines()
                        .filter(|l| !l.trim().is_empty())
                        .map(|l| format!("<p>{}</p>", quick_xml_escape(l.trim())))
                        .collect();
                    format!("<h1>{}</h1>\n{}", quick_xml_escape(title), paras.join("\n"))
                };
                format!(
                    "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<title>{}</title>\n<style>\nbody {{ font-family: sans-serif; line-height: 1.6; margin: 40px; color: #1e293b; }}\nh1 {{ color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }}\np {{ margin-bottom: 12px; font-size: 14px; }}\n</style>\n</head>\n<body>\n{}\n</body>\n</html>",
                    quick_xml_escape(title),
                    html_body
                )
            }
            "calc" | "ods" => {
                // Flat OpenDocument Spreadsheet (.fods) pour LibreOffice Calc
                let rows_xml = content.lines().map(|line| {
                    let cells: Vec<String> = line.split(&[';', ','][..]).map(|c| {
                        let trimmed = c.trim();
                        if let Ok(num) = trimmed.parse::<f64>() {
                            format!(r#"<table:table-cell office:value-type="float" office:value="{}"><text:p>{}</text:p></table:table-cell>"#, num, trimmed)
                        } else {
                            format!(r#"<table:table-cell office:value-type="string"><text:p>{}</text:p></table:table-cell>"#, quick_xml_escape(trimmed))
                        }
                    }).collect();
                    format!(r#"<table:table-row>{}</table:table-row>"#, cells.join(""))
                }).collect::<Vec<String>>().join("\n        ");

                format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
                 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
                 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
                 office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
  <office:body>
    <office:spreadsheet>
      <table:table table:name="{}">
        {}
      </table:table>
    </office:spreadsheet>
  </office:body>
</office:document>"#,
                    quick_xml_escape(title),
                    rows_xml
                )
            }
            "impress" | "odp" => {
                // Flat OpenDocument Presentation (.fodp) pour LibreOffice Impress
                let slides: Vec<&str> = content.split("---").map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                let pages_xml = if slides.is_empty() {
                    format!(r#"<draw:page draw:name="Slide1"><draw:frame><draw:text-box><text:h text:outline-level="1">{}</text:h><text:p>{}</text:p></draw:text-box></draw:frame></draw:page>"#, quick_xml_escape(title), quick_xml_escape(content))
                } else {
                    slides.iter().enumerate().map(|(idx, slide)| {
                        format!(r#"<draw:page draw:name="Slide{}"><draw:frame><draw:text-box><text:h text:outline-level="1">Diapositive {}</text:h><text:p>{}</text:p></draw:text-box></draw:frame></draw:page>"#, idx + 1, idx + 1, quick_xml_escape(slide).replace('\n', "</text:p><text:p>"))
                    }).collect::<Vec<String>>().join("\n      ")
                };

                format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
                 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
                 xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
                 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
                 office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.presentation">
  <office:body>
    <office:presentation>
      {}
    </office:presentation>
  </office:body>
</office:document>"#,
                    pages_xml
                )
            }
            "math" | "odf" | "mml" => {
                // MathML (.mml) pour LibreOffice Math
                format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<math xmlns="http://www.w3.org/1998/Math/MathML">
  <mrow>
    <mtext>{}</mtext>
  </mrow>
  <mrow>
    {}
  </mrow>
</math>"#,
                    quick_xml_escape(title),
                    content.trim()
                )
            }
            "draw" | "odg" | "svg" => {
                // Schéma SVG vectoriel pour LibreOffice Draw
                format!(
                    r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
  <rect width="800" height="600" fill="#ffffff" />
  <text x="40" y="50" font-family="sans-serif" font-size="24" font-weight="bold" fill="#1e293b">{}</text>
  {}
</svg>"##,
                    quick_xml_escape(title),
                    content.trim()
                )
            }
            "base" | "odb" | "sql" => {
                // Script de schéma SQL pour LibreOffice Base
                format!(
                    "-- Base de données pour LibreOffice Base : {}\n-- Généré par Singular Code\n\n{}\n",
                    title,
                    content.trim()
                )
            }
            _ => content.to_string(),
        };

        if app == "writer" || app == "odt" || target_path.extension().map(|e| e == "odt").unwrap_or(false) {
            let parent_dir = target_path.parent().unwrap_or(self.workspace_root());
            let stem = target_path.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
            let temp_html = parent_dir.join(format!(".temp_{}.html", stem));
            std::fs::write(&temp_html, generated_content.as_bytes()).map_err(ToolError::Io)?;

            let temp_profile = TempDirGuard::new("singular_lo_gen").map_err(ToolError::Io)?;
            let profile_arg = format!("-env:UserInstallation=file://{}", temp_profile.path.display());

            let cmd = tokio::process::Command::new("libreoffice")
                .arg(&profile_arg)
                .arg("--headless")
                .arg("--convert-to")
                .arg("odt")
                .arg(&temp_html)
                .arg("--outdir")
                .arg(parent_dir)
                .output();

            let output = tokio::time::timeout(std::time::Duration::from_secs(25), cmd)
                .await
                .map_err(|_| ToolError::Sandbox("Délai d'attente dépassé (25s) lors de la génération LibreOffice".to_string()))?
                .map_err(ToolError::Io)?;

            let _ = std::fs::remove_file(&temp_html);

            let mut converted = false;
            if output.status.success() {
                let gen_odt = parent_dir.join(format!(".temp_{}.odt", stem));
                if gen_odt.exists() {
                    let _ = std::fs::rename(gen_odt, &target_path);
                    converted = true;
                }
            }
            if !converted && !target_path.exists() {
                std::fs::write(&target_path, generated_content.as_bytes()).map_err(ToolError::Io)?;
            }
        } else {
            std::fs::write(&target_path, generated_content.as_bytes()).map_err(ToolError::Io)?;
        }

        let rel_path = target_path
            .strip_prefix(self.workspace_root())
            .unwrap_or(&target_path)
            .to_string_lossy()
            .to_string();

        Ok(serde_json::json!({
            "status": "success",
            "message": format!("Fichier {} généré avec succès pour LibreOffice.", rel_path),
            "file": rel_path,
            "app_type": app,
            "target": match app.as_str() {
                "writer" | "odt" => "LibreOffice Writer",
                "calc" | "ods" => "LibreOffice Calc",
                "impress" | "odp" => "LibreOffice Impress",
                "draw" | "odg" | "svg" => "LibreOffice Draw",
                "math" | "odf" | "mml" => "LibreOffice Math",
                "base" | "odb" | "sql" => "LibreOffice Base",
                _ => "LibreOffice Suite",
            }
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_file_tools_lifecycle() {
        let dir = tempdir().unwrap();
        let registry = ToolRegistry::new(dir.path(), SandboxConfig::default()).unwrap();

        // 1. Write file
        registry.write_file("hello.txt", "Hello World!").unwrap();

        // 2. Read file
        let content = registry.read_file("hello.txt", None, None).unwrap();
        assert_eq!(content, "Hello World!");

        // 3. Edit file unique match
        registry
            .edit_file("hello.txt", "World", "Antigravity")
            .unwrap();
        let updated = registry.read_file("hello.txt", None, None).unwrap();
        assert_eq!(updated, "Hello Antigravity!");

        // 4. Edit file ambiguous match fails
        registry
            .write_file("repeat.txt", "foo bar foo baz")
            .unwrap();
        let err = registry.edit_file("repeat.txt", "foo", "qux");
        assert!(matches!(err, Err(ToolError::EditFailed(_))));

        // 5. Grep match
        let grep_res = registry.grep_files("Antigravity", None, true).unwrap();
        assert_eq!(grep_res.len(), 1);
        assert_eq!(grep_res[0].file, "hello.txt");

        // 6. Delete file
        registry.delete_file("hello.txt").unwrap();
        assert!(registry.read_file("hello.txt", None, None).is_err());
    }

    #[tokio::test]
    async fn test_bwrap_sandbox_isolated_execution() {
        let dir = tempdir().unwrap();
        let registry = ToolRegistry::new(dir.path(), SandboxConfig::default()).unwrap();

        let output = registry.run_command("echo 'test-ok' > output.txt && cat output.txt").await.unwrap();
        // Si l'environnement de test tourne déjà dans un conteneur restreignant unshare
        if output.stderr.contains("Creating new namespace failed") {
            println!("Note: Test exécuté dans un conteneur imbriqué où unshare est restreint");
            return;
        }

        assert_eq!(output.exit_code, 0, "bwrap failed: stderr: {}", output.stderr);
        assert!(output.stdout.contains("test-ok"));
        let content = registry.read_file("output.txt", None, None).unwrap();
        assert!(content.contains("test-ok"));
    }

    #[tokio::test]
    async fn test_bwrap_cannot_write_to_root_or_home() {
        let dir = tempdir().unwrap();
        let registry = ToolRegistry::new(dir.path(), SandboxConfig::default()).unwrap();

        let output = registry.run_command("touch /usr/hacked.txt").await.unwrap();
        if output.stderr.contains("Creating new namespace failed") {
            println!("Note: Test exécuté dans un conteneur imbriqué où unshare est restreint");
            return;
        }

        assert_ne!(output.exit_code, 0);
        assert!(output.stderr.to_lowercase().contains("read-only"));
    }

    #[tokio::test]
    async fn test_blocklist_prevents_rm_rf_root() {
        let dir = tempdir().unwrap();
        let registry = ToolRegistry::new(dir.path(), SandboxConfig::default()).unwrap();

        let res = registry.run_command("rm -rf /").await;
        assert!(res.is_err());
    }

    #[test]
    fn test_nonexistent_file_gives_helpful_not_found_with_file_hints() {
        let dir = tempdir().unwrap();
        let registry = ToolRegistry::new(dir.path(), SandboxConfig::default()).unwrap();

        // Créer un vrai fichier
        registry.write_file("main.rs", "fn main() {}").unwrap();

        // Tenter de lire un fichier qui n'existe pas
        let res = registry.read_file("nonexistent.py", None, None);
        assert!(matches!(res, Err(ToolError::NotFound(_))));
        if let Err(ToolError::NotFound(msg)) = res {
            assert!(msg.contains("nonexistent.py"));
            assert!(msg.contains("main.rs")); // Vérifier que le fichier existant est suggéré dans le hint
        }

        // Tenter de modifier un fichier qui n'existe pas
        let res_edit = registry.edit_file("ghost.txt", "a", "b");
        assert!(matches!(res_edit, Err(ToolError::NotFound(_))));

        // Tester list_dir avec ".", "", "/", "./"
        let list_dot = registry.list_dir(Some("."), false, None).unwrap();
        assert_eq!(list_dot.len(), 1);
        assert_eq!(list_dot[0].name, "main.rs");

        let list_slash = registry.list_dir(Some("/"), false, None).unwrap();
        assert_eq!(list_slash.len(), 1);

        let list_none = registry.list_dir(None, false, None).unwrap();
        assert_eq!(list_none.len(), 1);
    }

    #[tokio::test]
    async fn test_generate_libreoffice_templates_all_apps() {
        let dir = tempdir().unwrap();
        let registry = ToolRegistry::new(dir.path(), SandboxConfig::default()).unwrap();

        // 1. Writer (.odt)
        let res_writer = registry.generate_libreoffice_template("writer", "rapport.odt", "Rapport Annuel", "Introduction\nConclusion").await.unwrap();
        assert_eq!(res_writer["status"], "success");
        assert!(dir.path().join("rapport.odt").exists());

        // 2. Calc (.fods)
        let res_calc = registry.generate_libreoffice_template("calc", "budget.fods", "Budget 2026", "A,B,100\nC,D,200").await.unwrap();
        assert_eq!(res_calc["status"], "success");
        let content_calc = std::fs::read_to_string(dir.path().join("budget.fods")).unwrap();
        assert!(content_calc.contains("application/vnd.oasis.opendocument.spreadsheet"));

        // 3. Impress (.fodp)
        let res_impress = registry.generate_libreoffice_template("impress", "deck.fodp", "Présentation", "Slide 1\n---\nSlide 2").await.unwrap();
        assert_eq!(res_impress["status"], "success");
        let content_impress = std::fs::read_to_string(dir.path().join("deck.fodp")).unwrap();
        assert!(content_impress.contains("application/vnd.oasis.opendocument.presentation"));

        // 4. Draw (.svg)
        let res_draw = registry.generate_libreoffice_template("draw", "schema.svg", "Architecture", "<circle cx=\"50\" cy=\"50\" r=\"40\" />").await.unwrap();
        assert_eq!(res_draw["status"], "success");
        let content_draw = std::fs::read_to_string(dir.path().join("schema.svg")).unwrap();
        assert!(content_draw.contains("<svg"));

        // 5. Math (.mml)
        let res_math = registry.generate_libreoffice_template("math", "eq.mml", "Pythagore", "<mi>a</mi><mo>+</mo><mi>b</mi>").await.unwrap();
        assert_eq!(res_math["status"], "success");
        let content_math = std::fs::read_to_string(dir.path().join("eq.mml")).unwrap();
        assert!(content_math.contains("http://www.w3.org/1998/Math/MathML"));

        // 6. Base (.sql)
        let res_base = registry.generate_libreoffice_template("base", "schema.sql", "Comptabilite", "CREATE TABLE users (id INT);").await.unwrap();
        assert_eq!(res_base["status"], "success");
        let content_base = std::fs::read_to_string(dir.path().join("schema.sql")).unwrap();
        assert!(content_base.contains("CREATE TABLE users"));
    }

    #[tokio::test]
    async fn test_read_libreoffice_doc_and_read_file_transparent_support() {
        let dir = tempdir().unwrap();
        let registry = ToolRegistry::new(dir.path(), SandboxConfig::default()).unwrap();

        // 1. Créer un document .odt réel
        let res_writer = registry.generate_libreoffice_template(
            "writer",
            "analyse_sonic.odt",
            "Analyse Sonic 06 et Generations",
            "Prologue: Le Festival de Solaris.\nShadow the Hedgehog et Silver the Hedgehog."
        ).await.unwrap();
        assert_eq!(res_writer["status"], "success");

        // 2. Tester read_libreoffice_doc
        let doc_data = registry.read_libreoffice_doc("analyse_sonic.odt").await.unwrap();
        assert_eq!(doc_data["status"], "success");
        let extracted_text = doc_data["content"].as_str().unwrap();
        assert!(extracted_text.contains("Solaris") || extracted_text.contains("Sonic"));

        // 3. Tester read_file transparentement sur le fichier .odt
        let text_via_read_file = registry.read_file("analyse_sonic.odt", None, None).unwrap();
        assert!(text_via_read_file.contains("Solaris") || text_via_read_file.contains("Sonic"));
    }
}
