use std::sync::Arc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use thiserror::Error;
use tokio::sync::Mutex;

use crate::checkpoints::CheckpointManager;
use crate::tools::{ToolError, ToolRegistry};

#[derive(Error, Debug)]
pub enum AgentError {
    #[error("Erreur HTTP/LLM : {0}")]
    Network(#[from] reqwest::Error),
    #[error("Erreur de parsing JSON : {0}")]
    Json(#[from] serde_json::Error),
    #[error("Erreur d'outil : {0}")]
    Tool(#[from] ToolError),
    #[error("Boucle infinie détectée : l'agent répète la même action en boucle sans progrès")]
    InfiniteLoopDetected,
    #[error("Nombre maximal d'itérations atteint ({0})")]
    MaxIterationsReached(usize),
    #[error("Arrêt demandé par l'utilisateur")]
    Aborted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProfile {
    pub name: String,
    pub api_url: String, // ex: http://localhost:11434/v1 ou http://localhost:1234/v1
    pub model_id: String,
    pub api_key: Option<String>,
    pub temperature: f32,
    pub max_tokens: usize,
    #[serde(default)]
    pub num_ctx: Option<usize>,
    pub supports_native_tools: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalMode {
    Ask,
    Architect,
    Code,
    Debug,
    Review,
    AutoEdit,
    Yolo,
    #[serde(other)]
    Default,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system", "user", "assistant", "tool"
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsageMetrics {
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
    pub total_tokens: usize,
    pub current_num_ctx: usize,
    pub max_tokens: usize,
    pub auto_expanded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStepEvent {
    pub step_type: String, // "thought", "token", "tool_call", "tool_result", "permission_request", "done", "error", "token_usage", "context_expanded"
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_args: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_usage: Option<TokenUsageMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningItem {
    pub id: String,
    pub category: String, // "architecture", "convention", "bugfix", "preference"
    pub title: String,
    pub content: String,
    pub timestamp: String,
}

/// Truncates a string slice to at most `max_bytes` without splitting UTF-8 character boundaries.
pub fn safe_truncate_str(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut boundary = max_bytes;
    while boundary > 0 && !s.is_char_boundary(boundary) {
        boundary -= 1;
    }
    &s[..boundary]
}

/// Extracts thinking content from `<think>...</think>` tags and strips them from the response.
/// Robustly handles unclosed tags, missing opening/closing tags, and inverted tags.
pub fn extract_and_strip_think_tags(raw: &str) -> (Option<String>, String) {
    let mut thoughts: Vec<String> = Vec::new();
    let mut clean_text = String::new();
    let mut cur = raw;

    while let Some(start) = cur.find("<think>") {
        let before = &cur[..start];
        let before_cleaned = before.replace("</think>", "");
        clean_text.push_str(&before_cleaned);

        let after_open = &cur[start + "<think>".len()..];
        if let Some(end) = after_open.find("</think>") {
            let thought_content = &after_open[..end];
            let trimmed = thought_content.trim();
            if !trimmed.is_empty() {
                thoughts.push(trimmed.to_string());
            }
            cur = &after_open[end + "</think>".len()..];
        } else {
            let trimmed = after_open.trim();
            if !trimmed.is_empty() {
                thoughts.push(trimmed.to_string());
            }
            cur = "";
            break;
        }
    }

    if !cur.is_empty() {
        let remaining_cleaned = cur.replace("</think>", "").replace("<think>", "");
        clean_text.push_str(&remaining_cleaned);
    }

    let thought_res = if thoughts.is_empty() {
        None
    } else {
        Some(thoughts.join("\n\n"))
    };

    let text_res = clean_text.trim().to_string();
    (thought_res, text_res)
}

/// Compacts conversation history while preserving prompt context and tool call pairing.
/// When retaining messages from `keep_from`, adjusts `keep_from` backwards so that an
/// assistant message with `tool_calls` and its following tool result messages (`role: "tool"`)
/// are never separated. If `keep_from` points into a sequence of tool responses, moves it back
/// to the assistant message that spawned them.
pub fn compact_conversation_history(messages: &[Value], keep_count: usize) -> Vec<Value> {
    if messages.len() <= 3 {
        return messages.to_vec();
    }

    let mut keep_from = messages.len().saturating_sub(keep_count);

    // Adjust keep_from backwards if it lands in a sequence of tool responses
    // so that an assistant message with tool_calls and its following tool responses are never separated.
    while keep_from > 0 && messages[keep_from].get("role").and_then(|r| r.as_str()) == Some("tool") {
        keep_from -= 1;
    }

    if keep_from <= 2 {
        return messages.to_vec();
    }

    let mut compacted = Vec::new();
    // System prompt intact
    compacted.push(messages[0].clone());
    // Initial user prompt intact
    if messages.len() > 1 {
        compacted.push(messages[1].clone());
    }
    // Compaction summary marker
    compacted.push(json!({
        "role": "system",
        "content": "[PRÉPARATION DE LA SÉRIE SUIVANTE : Les étapes intermédiaires précédentes ont été validées et archivées. Espace de tokens libéré pour la prochaine série]."
    }));

    for m in &messages[keep_from..] {
        compacted.push(m.clone());
    }

    compacted
}

/// Checks whether a string looks like a tool call wrapper or envelope rather than pure source code.
pub fn looks_like_tool_call_envelope(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    if trimmed.contains("<tool_call>") || trimmed.contains("</tool_call>")
        || trimmed.contains("<tool>") || trimmed.contains("</tool>")
        || trimmed.contains("<invoke>") || trimmed.contains("</invoke>")
        || trimmed.starts_with("```tool_call")
    {
        return true;
    }

    if trimmed.starts_with('{') {
        if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
            if let Some(obj) = val.as_object() {
                let has_tool_name = obj.contains_key("name")
                    || obj.contains_key("tool")
                    || obj.contains_key("tool_name")
                    || obj.contains_key("action")
                    || obj.contains_key("function");
                let has_args = obj.contains_key("parameters")
                    || obj.contains_key("arguments")
                    || obj.contains_key("args")
                    || obj.contains_key("params")
                    || obj.contains_key("input");

                if has_tool_name && has_args {
                    return true;
                }

                if obj.get("type").and_then(|t| t.as_str()) == Some("function") && obj.contains_key("function") {
                    return true;
                }
            }
        } else {
            let candidate = trimmed.to_lowercase();
            let patterns = [
                "\"name\":", "\"tool\":", "\"action\":", "\"function\":",
                "'name':", "'tool':", "'action':", "'function':"
            ];
            let arg_patterns = [
                "\"parameters\":", "\"arguments\":", "\"args\":", "\"input\":",
                "'parameters':", "'arguments':", "'args':", "'input':"
            ];
            let has_name = patterns.iter().any(|p| candidate.contains(p));
            let has_args = arg_patterns.iter().any(|p| candidate.contains(p));
            if has_name && has_args {
                return true;
            }
        }
    }

    false
}

/// Attempts to repair slightly malformed JSON strings emitted by LLMs.
pub fn repair_json_string(s: &str) -> Option<Value> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
        return Some(val);
    }

    let unescaped = if trimmed.starts_with("```") {
        let after_fence = trimmed.trim_start_matches('`');
        let code_content = if let Some(newline_pos) = after_fence.find('\n') {
            &after_fence[newline_pos + 1..]
        } else {
            after_fence
        };
        code_content.trim_end_matches('`').trim()
    } else {
        trimmed
    };

    if let Ok(val) = serde_json::from_str::<Value>(unescaped) {
        return Some(val);
    }

    let start_brace = unescaped.find('{')?;
    let end_brace = unescaped.rfind('}')?;
    if end_brace <= start_brace {
        return None;
    }
    let json_slice = &unescaped[start_brace..=end_brace];

    if let Ok(val) = serde_json::from_str::<Value>(json_slice) {
        return Some(val);
    }

    let mut cleaned = String::with_capacity(json_slice.len());
    let chars: Vec<char> = json_slice.chars().collect();
    let mut i = 0;
    let mut in_str = false;
    let mut escape = false;

    while i < chars.len() {
        let c = chars[i];
        if in_str {
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_str = false;
            }
            cleaned.push(c);
        } else {
            if c == '"' {
                in_str = true;
                cleaned.push(c);
            } else if c == ',' {
                let mut j = i + 1;
                while j < chars.len() && chars[j].is_whitespace() {
                    j += 1;
                }
                if j < chars.len() && (chars[j] == '}' || chars[j] == ']') {
                    // Skip trailing comma
                } else {
                    cleaned.push(c);
                }
            } else {
                cleaned.push(c);
            }
        }
        i += 1;
    }

    if let Ok(val) = serde_json::from_str::<Value>(&cleaned) {
        return Some(val);
    }

    None
}

pub struct AgentEngine {
    _client: Client,
    pub profile: ModelProfile,
    pub approval_mode: ApprovalMode,
    pub max_iterations: usize,
    pub is_aborted: Arc<Mutex<bool>>,
}

impl AgentEngine {
    pub fn safe_truncate_str(s: &str, max_bytes: usize) -> &str {
        safe_truncate_str(s, max_bytes)
    }

    pub fn extract_and_strip_think_tags(raw: &str) -> (Option<String>, String) {
        extract_and_strip_think_tags(raw)
    }

    pub fn compact_conversation_history(messages: &[Value], keep_count: usize) -> Vec<Value> {
        compact_conversation_history(messages, keep_count)
    }

    pub fn looks_like_tool_call_envelope(text: &str) -> bool {
        looks_like_tool_call_envelope(text)
    }

    pub fn repair_json_string(s: &str) -> Option<Value> {
        repair_json_string(s)
    }

    pub async fn execute_fallback_tool(
        &self,
        name: &str,
        args: &Value,
        tools: &ToolRegistry,
        checkpoints: &CheckpointManager,
    ) -> Result<Value, String> {
        self.execute_tool(name, args, tools, checkpoints).await
    }

    pub fn new(profile: ModelProfile, approval_mode: ApprovalMode) -> Self {
        Self {
            _client: Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .unwrap_or_default(),
            profile,
            approval_mode,
            max_iterations: 25,
            is_aborted: Arc::new(Mutex::new(false)),
        }
    }

    pub fn load_learnings(ws_root: &std::path::Path) -> Vec<LearningItem> {
        let path = ws_root.join(".localagent").join("learnings.json");
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(items) = serde_json::from_str::<Vec<LearningItem>>(&content) {
                    return items;
                }
            }
        }
        Vec::new()
    }

    pub fn save_learning_to_file(ws_root: &std::path::Path, item: LearningItem) -> Result<(), String> {
        let dir = ws_root.join(".localagent");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join("learnings.json");
        let mut list = Self::load_learnings(ws_root);
        list.retain(|i| i.id != item.id);
        list.push(item);
        let json_str = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
        std::fs::write(&path, json_str).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_learning_from_file(ws_root: &std::path::Path, id: &str) -> Result<(), String> {
        let dir = ws_root.join(".localagent");
        let path = dir.join("learnings.json");
        let mut list = Self::load_learnings(ws_root);
        list.retain(|i| i.id != id);
        let json_str = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
        std::fs::write(&path, json_str).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn abort(&self) {
        let mut aborted = self.is_aborted.lock().await;
        *aborted = true;
    }

    /// Définitions des outils au format standard OpenAI Function Calling
    pub fn get_tools_definitions() -> Vec<Value> {
        vec![
            json!({
                "type": "function",
                "function": {
                    "name": "read_file",
                    "description": "Lit le contenu textuel d'un fichier du workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin relatif du fichier" },
                            "offset": { "type": "integer", "description": "Numéro de la ligne de début (1-indexé)" },
                            "limit": { "type": "integer", "description": "Nombre maximal de lignes à lire" }
                        },
                        "required": ["path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "write_file",
                    "description": "Crée ou écrase un fichier dans le workspace avec le contenu fourni.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin relatif du fichier" },
                            "content": { "type": "string", "description": "Contenu complet à écrire" }
                        },
                        "required": ["path", "content"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "edit_file",
                    "description": "Remplace une séquence de texte unique dans un fichier existant. Échoue si la cible n'apparaît pas ou apparaît plusieurs fois.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin relatif du fichier" },
                            "target_content": { "type": "string", "description": "Bloc de code exact et unique à remplacer" },
                            "replacement_content": { "type": "string", "description": "Nouveau bloc de remplacement" }
                        },
                        "required": ["path", "target_content", "replacement_content"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "list_dir",
                    "description": "Liste les répertoires et fichiers dans le workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin relatif optionnel du sous-dossier" },
                            "recursive": { "type": "boolean", "description": "Lister récursivement ou non" },
                            "max_depth": { "type": "integer", "description": "Profondeur maximale (défaut: 4)" }
                        }
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "glob_files",
                    "description": "Recherche des fichiers correspondant à un motif glob (ex: src/**/*.ts).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "pattern": { "type": "string", "description": "Motif glob" }
                        },
                        "required": ["pattern"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "grep_files",
                    "description": "Recherche une chaîne ou une regex dans l'ensemble des fichiers du workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "pattern": { "type": "string", "description": "Chaîne ou regex à rechercher" },
                            "path": { "type": "string", "description": "Sous-dossier optionnel" },
                            "case_sensitive": { "type": "boolean", "description": "Sensibilité à la casse (défaut: false)" }
                        },
                        "required": ["pattern"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "run_command",
                    "description": "Exécute une commande shell de façon sécurisée et isolée dans le bac à sable Bubblewrap.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": { "type": "string", "description": "Ligne de commande à exécuter" }
                        },
                        "required": ["command"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "delete_file",
                    "description": "Supprime un fichier ou un dossier du workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin du fichier à supprimer" }
                        },
                        "required": ["path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "move_file",
                    "description": "Déplace ou renomme un fichier/dossier.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "source": { "type": "string", "description": "Chemin source" },
                            "destination": { "type": "string", "description": "Chemin de destination" }
                        },
                        "required": ["source", "destination"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "create_dir",
                    "description": "Crée un nouveau répertoire dans le workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin du répertoire à créer" }
                        },
                        "required": ["path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "todo_write",
                    "description": "Met à jour la liste des tâches / plan d'action visible en direct par l'utilisateur.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "todos": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": { "type": "string" },
                                        "task": { "type": "string" },
                                        "status": { "type": "string", "enum": ["pending", "in_progress", "done"] }
                                    },
                                    "required": ["id", "task", "status"]
                                }
                            }
                        },
                        "required": ["todos"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "web_search",
                    "description": "Recherche en direct sur le Web (via DuckDuckGo) des informations récentes, documentations ou solutions.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "Mots-clés de la recherche web" },
                            "limit": { "type": "integer", "description": "Nombre maximal de résultats (défaut: 5)" }
                        },
                        "required": ["query"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "fetch_url",
                    "description": "Télécharge et extrait le texte d'une page web ou d'une documentation en ligne.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "url": { "type": "string", "description": "URL complète (https://...)" }
                        },
                        "required": ["url"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "search_semantic",
                    "description": "Recherche sémantique et par pertinence (RAG local) dans le code source du projet.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "Termes ou concepts recherchés dans le code" },
                            "limit": { "type": "integer", "description": "Nombre maximal d'extraits (défaut: 5)" }
                        },
                        "required": ["query"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "ast_grep",
                    "description": "Recherche ciblée de fonctions, classes, interfaces ou imports dans le code source.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "Nom ou motif du symbole" },
                            "kind": { "type": "string", "description": "'fn', 'class', 'import' ou 'any'" },
                            "path": { "type": "string", "description": "Sous-dossier optionnel" }
                        },
                        "required": ["query"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "generate_project_docs",
                    "description": "Génère un rapport d'architecture complet avec diagrammes Mermaid du projet.",
                    "parameters": {
                        "type": "object",
                        "properties": {}
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "inspect_sqlite_db",
                    "description": "Inspecte les tables et exécute des requêtes de diagnostic sur une base SQLite.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin relatif de la base SQLite (.db, .sqlite)" },
                            "query": { "type": "string", "description": "Requête SQL à exécuter (ou vide pour lister les tables)" }
                        },
                        "required": ["path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "run_test_suite",
                    "description": "Détecte et exécute automatiquement la suite de tests du projet (cargo test, npm test, pytest).",
                    "parameters": {
                        "type": "object",
                        "properties": {}
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "check_http_service",
                    "description": "Vérifie si un serveur web local ou service répond sur un port (ex: 3000, 8080, 5173).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "port": { "type": "integer", "description": "Numéro du port TCP à tester" },
                            "path": { "type": "string", "description": "Chemin optionnel (ex: '/health' ou '/')" }
                        },
                        "required": ["port"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "calculate_code_metrics",
                    "description": "Calcule les métriques de qualité (lignes de code, commentaires, complexité cyclomatique estimée).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Fichier ou dossier spécifique optionnel" }
                        }
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "inspect_binary",
                    "description": "Inspecte un binaire ou bibliothèque Linux (ELF / Wasm) pour extraire symboles et architecture.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin relatif du binaire (ex: target/release/app)" }
                        },
                        "required": ["path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "profile_benchmark",
                    "description": "Mesure la vitesse d'exécution et le temps CPU d'une commande de benchmark.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": { "type": "string", "description": "Commande à mesurer (ex: cargo bench ou npm run test)" }
                        },
                        "required": ["command"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "analyze_local_image",
                    "description": "Analyse visuellement une image, capture d'écran ou maquette locale via le modèle multimodal local.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin de l'image (png, jpg, webp)" },
                            "prompt": { "type": "string", "description": "Consigne spécifique d'analyse ou de conversion en code" }
                        },
                        "required": ["path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "save_learning",
                    "description": "Enregistre une convention, architecture ou solution réutilisable dans la mémoire persistante (.localagent/learnings.json).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "category": { "type": "string", "enum": ["architecture", "convention", "bugfix", "preference"], "description": "Catégorie de l'apprentissage" },
                            "title": { "type": "string", "description": "Titre court et explicite de la leçon/convention" },
                            "content": { "type": "string", "description": "Description détaillée de la règle apprise" }
                        },
                        "required": ["category", "title", "content"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "hybrid_search",
                    "description": "Recherche hybride par pertinence BM25 + symboles AST + noms de fichiers dans l'ensemble du projet.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "Mots-clés ou identifiants recherchés" },
                            "limit": { "type": "integer", "description": "Nombre max de résultats (défaut: 15)" }
                        },
                        "required": ["query"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "export_libreoffice_doc",
                    "description": "Convertit un fichier du workspace en document bureautique LibreOffice (ODT pour Writer, ODS pour Calc, ODP pour Impress, PDF, DOCX, XLSX).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "source_path": { "type": "string", "description": "Chemin relatif du fichier source (HTML, Markdown, CSV, TXT)" },
                            "target_format": { "type": "string", "enum": ["odt", "ods", "odp", "odg", "pdf", "docx", "xlsx", "pptx"], "description": "Format bureautique cible" },
                            "outdir": { "type": "string", "description": "Sous-dossier de destination optionnel" }
                        },
                        "required": ["source_path", "target_format"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "generate_libreoffice_template",
                    "description": "Génère directement un document OpenDocument prêt à ouvrir dans LibreOffice (Writer: .odt, Calc: .fods, Impress: .fodp, Draw: .svg, Math: .mml, Base: .sql).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "app_type": { "type": "string", "enum": ["writer", "calc", "impress", "draw", "math", "base"], "description": "Application LibreOffice visée" },
                            "path": { "type": "string", "description": "Chemin du fichier à créer (ex: document.odt, budget.fods, diapo.fodp, schema.svg, formule.mml, base.sql)" },
                            "title": { "type": "string", "description": "Titre du document" },
                            "content": { "type": "string", "description": "Contenu du document (texte pour Writer, données séparées par virgules pour Calc, diapositives séparées par '---' pour Impress, SVG pour Draw, MathML pour Math, SQL pour Base)" }
                        },
                        "required": ["app_type", "path", "title", "content"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "read_libreoffice_doc",
                    "description": "Lit et extrait le contenu textuel complet d'un document bureautique (ODT Writer, ODS Calc, ODP Impress, DOCX, XLSX, PDF) afin de pouvoir l'analyser, le résumer, le réorganiser ou l'améliorer.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Chemin du document à lire (ex: analyse.odt, rapport.docx, budget.ods)" }
                        },
                        "required": ["path"]
                    }
                }
            })
        ]
    }

    /// Génère le prompt système par défaut enrichi de l'arborescence, des règles de projet et du mode d'opération
    pub fn build_system_prompt(
        &self,
        tools: &ToolRegistry,
        project_rules: Option<&str>,
        project_folders: Option<&[String]>,
    ) -> String {
        let mode_instructions = match self.approval_mode {
            ApprovalMode::Yolo | ApprovalMode::Code => {
                "MODE ACTIF : EXÉCUTION DIRECTE (AUTONOMIE MAXIMALE).\n\
                 Tu DOIS créer et modifier immédiatement les fichiers réels sur le disque sans tergiverser ni demander d'accord.\n\
                 N'affiche JAMAIS de simples blocs de code dans le chat en attendant qu'on les copie : appelle DIRECTEMENT `write_file` ou `edit_file` !"
            }
            ApprovalMode::Architect => {
                "MODE ACTIF : ARCHITECTE.\n\
                 Définis l'architecture avec `todo_write`, puis crée les fichiers de structure et squelettes réels avec `write_file`."
            }
            ApprovalMode::Debug => {
                "MODE ACTIF : DÉBOGAGE.\n\
                 Lis les fichiers cibles et logs d'erreur, puis applique les corrections directement via `edit_file`."
            }
            _ => {
                "MODE ACTIF : CODE AUTOMATISÉ.\n\
                 Passe directement à l'écriture de code concret dans le workspace."
            }
        };

        let mut prompt = format!(
            "Tu es un Agent de Code IA autonome de niveau expert s'exécutant localement sous Linux.\n\
             Tu disposes d'outils réels pour explorer, lire, modifier des fichiers, exécuter des commandes shell et rechercher sur le Web.\n\n\
             {}\n\n\
             RÈGLES FONDAMENTALES D'ACTION (IMPÉRATIVES) :\n\
             1. BIAIS VERS L'ACTION CONCRÈTE : Si l'utilisateur demande de coder, créer ou modifier, appelle DIRECTEMENT `create_dir`, `write_file` ou `generate_libreoffice_template` dès ton premier tour.\n\
             2. INTERDICTION DE DEMANDER LE CONTENU D'UN FICHIER OU DE REFUSER : Si l'utilisateur te demande d'améliorer, analyser ou réorganiser un fichier (code, texte, ou bureautique comme .odt, .docx, .ods), LIS-LE TOI-MÊME IMMÉDIATEMENT via `read_file` ou `read_libreoffice_doc`. Ne dis JAMAIS 'Je ne peux pas y accéder' ou 'Fournis-moi le contenu' : tu as un accès direct aux fichiers du disque !\n\
             3. INTERDICTION FORMELLE DE DONNER DE SIMPLES CONSEILS TEXTUELS : Tu n'es pas un chatbot passif. Tout code ou document produit DOIT être écrit dans les fichiers réels sur le disque avec `write_file`, `edit_file` ou `generate_libreoffice_template`.\n\
             4. RÈGLE STRICTE SUR `todo_write` :\n\
                - Pour une tâche simple ou directe, N'APPELLE PAS `todo_write`. Crée directement les fichiers avec `write_file`.\n\
                - Si la tâche est vaste et requiert `todo_write`, tu as l'INTERDICTION de t'arrêter à un simple plan : tu DOIS enchaîner immédiatement dans la même itération ou la suivante avec `create_dir` ou `write_file`.\n\
                - N'appelle JAMAIS `todo_write` deux fois d'affilée sans avoir créé ou modifié de fichier entre-temps.\n\
             5. EXAMEN DU DOSSIER : Examine l'arborescence ci-dessous. Pour lire un fichier existant, utilise TOUJOURS `read_file` avec son chemin exact visible dans l'arborescence.\n\
             6. MODIFICATION CHIRURGICALE : Utilise `edit_file` pour remplacer un bloc de code existant via `target_content` et `replacement_content`.\n\
             7. CRÉATION DE DOSSIER : Pour initialiser un nouveau projet ou dossier, utilise `create_dir(path=\"nom\")`.\n\
             8. FORMAT DE SECOURS : Si le modèle ne supporte pas le function calling natif, écris tes appels d'outils sous la forme :\n\
                ```tool_call\n\
                {{\"name\": \"write_file\", \"arguments\": {{\"path\": \"chemin/fichier\", \"content\": \"code complet...\"}}}}\n\
                ```\n\
                Tu peux également écrire directement un bloc de code avec son chemin en en-tête (ex: ```typescript:src/app.ts) ou avec un commentaire en première ligne `// filepath: src/app.ts`.\n\
             9. NE T'ARRÊTE PAS : Une tâche n'est terminée que quand TOUS les fichiers réels ont été créés et vérifiés.\n",
            mode_instructions
        );

        // Injecter le chemin du workspace et la liste complète des fichiers
        let ws_root = tools.workspace_root().display().to_string();
        prompt.push_str(&format!("\n--- DOSSIER DU PROJET ACTUEL : {} ---\n", ws_root));

        // Injecter les multi-dossiers associés au projet s'il y en a plusieurs
        if let Some(folders) = project_folders {
            if folders.len() > 1 {
                prompt.push_str("\n--- DOSSIERS ASSOCIÉS AU PROJET (MULTI-DOSSIERS) ---\n");
                prompt.push_str("Ce projet regroupe les dossiers et racines de travail suivants :\n");
                for (idx, folder) in folders.iter().enumerate() {
                    let mark = if folder == &ws_root { " [RACINE ACTIVE]" } else { "" };
                    prompt.push_str(&format!("{}. {}{}\n", idx + 1, folder, mark));
                }
                prompt.push_str("----------------------------------------------------\n");
            }
        }

        match tools.list_dir(None, true, Some(4)) {
            Ok(entries) if !entries.is_empty() => {
                prompt.push_str("Arborescence complète des fichiers du projet :\n");
                for entry in entries.iter().take(60) {
                    if entry.is_dir {
                        prompt.push_str(&format!("📁 {}/\n", entry.path));
                    } else {
                        prompt.push_str(&format!("📄 {} ({} octets)\n", entry.path, entry.size));
                    }
                }
                if entries.len() > 60 {
                    prompt.push_str(&format!("... et {} autres fichiers (explore avec list_dir).\n", entries.len() - 60));
                }
            }
            _ => {
                prompt.push_str("Ce dossier est actuellement vide. Tu peux créer de nouveaux fichiers et dossiers avec write_file et create_dir.\n");
            }
        }
        prompt.push_str("--------------------------------------------------\n");

        // Lire AGENT.md s'il existe dans le workspace
        if let Ok(agent_md) = tools.read_file("AGENT.md", None, Some(100)) {
            prompt.push_str("\n--- INSTRUCTIONS DU PROJET (AGENT.md) ---\n");
            prompt.push_str(&agent_md);
            prompt.push_str("\n----------------------------------------\n");
        }

        // Injecter les règles du projet :
        if let Some(rules) = project_rules {
            if !rules.trim().is_empty() {
                prompt.push_str("\n--- RÈGLES & DIRECTIVES DU PROJET ACTIF (project.rules) ---\n");
                prompt.push_str(rules.trim());
                prompt.push_str("\n------------------------------------------------------------\n");
            }
        } else if let Ok(rules) = tools.read_file(".localagent/rules.md", None, Some(100))
            .or_else(|_| tools.read_file(".local_agent/rules.md", None, Some(100)))
        {
            prompt.push_str("\n--- RÈGLES DE CONDUITE DU PROJET (rules.md) ---\n");
            prompt.push_str(&rules);
            prompt.push_str("\n-----------------------------------------------\n");
        }

        // Injecter la mémoire long-terme persistante (.localagent/learnings.json) (Item 3)
        let learnings = Self::load_learnings(tools.workspace_root());
        if !learnings.is_empty() {
            prompt.push_str("\n--- 🧠 CONNAISSANCES & CONVENTIONS PERSISTANTES (.localagent/learnings.json) ---\n");
            prompt.push_str("Ces conventions et leçons ont été apprises et validées lors de sessions antérieures :\n");
            for (idx, item) in learnings.iter().enumerate() {
                prompt.push_str(&format!("{}. [{}] {} : {}\n", idx + 1, item.category.to_uppercase(), item.title, item.content));
            }
            prompt.push_str("--------------------------------------------------------------------------------\n");
        }

        // Directives Suite Bureautique LibreOffice (Base, Calc, Draw, Impress, Math, Writer)
        prompt.push_str("\n--- 📄 SUITE BUREAUTIQUE LIBREOFFICE (WRITER, CALC, IMPRESS, DRAW, MATH, BASE) ---\n");
        prompt.push_str("Tu as la capacité de LIRE, CRÉER, RÉORGANISER et EXPORTER des documents bureautiques 100% compatibles LibreOffice :\n");
        prompt.push_str("0. LECTURE & AMÉLIORATION DE DOCUMENTS EXISTANTS : Pour lire ou inspecter un document bureautique existant (.odt, .ods, .odp, .docx, .xlsx, .pdf), utilise `read_libreoffice_doc(path=\"...\")` ou `read_file(rel_path=\"...\")`. Si l'utilisateur demande d'améliorer, reformater ou réorganiser un document, lis d'abord son contenu, puis écris le nouveau document amélioré avec `generate_libreoffice_template(app_type=\"writer\", path=\"nouveau_nom.odt\", ...)` ! NE DIS JAMAIS QUE TU NE PEUX PAS LE FAIRE.\n");
        prompt.push_str("1. LibreOffice Writer (.odt, .pdf, .docx) : Rapports, courriers, documentation. Utilise `generate_libreoffice_template(app_type=\"writer\", path=\"nom.odt\", ...)` ou écris du HTML/Markdown puis convertis avec `export_libreoffice_doc(target_format=\"odt\")`.\n");
        prompt.push_str("2. LibreOffice Calc (.fods, .ods, .xlsx, .csv) : Feuilles de calcul, budgets, tableaux de bord. Utilise `generate_libreoffice_template(app_type=\"calc\", ...)` avec lignes séparées par des retours chariot et colonnes par des virgules, ou génère un .csv puis convertis en .ods.\n");
        prompt.push_str("3. LibreOffice Impress (.fodp, .odp, .pptx) : Présentations et diaporamas. Utilise `generate_libreoffice_template(app_type=\"impress\", ...)` en séparant les diapositives par '---'.\n");
        prompt.push_str("4. LibreOffice Draw (.svg, .fodg, .odg) : Schémas vectoriels, diagrammes, organigrammes. Utilise `generate_libreoffice_template(app_type=\"draw\", ...)` ou génère un fichier .svg complet.\n");
        prompt.push_str("5. LibreOffice Math (.mml, .odf) : Formules et équations scientifiques. Utilise `generate_libreoffice_template(app_type=\"math\", ...)` avec du MathML standard (<math xmlns=\"http://www.w3.org/1998/Math/MathML\">...).\n");
        prompt.push_str("6. LibreOffice Base (.sql, .odb, .db) : Bases de données relationnelles, schémas SQL, requêtes et rapports. Utilise `generate_libreoffice_template(app_type=\"base\", ...)` pour générer les scripts DDL/DML SQL compatibles SQLite/HSQLDB.\n");
        prompt.push_str("--------------------------------------------------------------------------------\n");

        prompt
    }

    /// Analyse et extrait les appels d'outils en repli (JSON / XML / texte brut) dans le texte
    pub fn parse_fallback_tool_calls(text: &str) -> Vec<(String, Value)> {
        let mut calls = Vec::new();

        // Fonction d'extraction d'un appel d'outil depuis un objet JSON
        let extract_call = |val: &Value| -> Option<(String, Value)> {
            let obj = val.as_object()?;

            // Détecter le nom de la fonction
            let name = obj
                .get("name")
                .or_else(|| obj.get("tool"))
                .or_else(|| obj.get("tool_name"))
                .or_else(|| obj.get("action"))
                .or_else(|| obj.get("function"))
                .or_else(|| obj.get("function_name"))
                .and_then(|v| {
                    if let Some(s) = v.as_str() {
                        Some(s.to_string())
                    } else if let Some(inner) = v.get("name").and_then(|n| n.as_str()) {
                        Some(inner.to_string())
                    } else {
                        None
                    }
                })
                .or_else(|| {
                    // Inférence heuristique si la clé de nom d'outil est omise par le LLM
                    if obj.contains_key("path") && (obj.contains_key("content") || obj.contains_key("text") || obj.contains_key("code")) {
                        Some("write_file".to_string())
                    } else if obj.contains_key("command") || obj.contains_key("cmd") {
                        Some("run_command".to_string())
                    } else if obj.contains_key("path") && obj.contains_key("target_content") && obj.contains_key("replacement_content") {
                        Some("edit_file".to_string())
                    } else if obj.contains_key("todos") {
                        Some("todo_write".to_string())
                    } else {
                        None
                    }
                })?;

            // Détecter les arguments
            let params = if let Some(p) = obj
                .get("parameters")
                .or_else(|| obj.get("arguments"))
                .or_else(|| obj.get("args"))
                .or_else(|| obj.get("params"))
                .or_else(|| obj.get("input"))
                .or_else(|| obj.get("action_input"))
            {
                match p {
                    Value::Object(_) => p.clone(),
                    Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or_else(|_| json!({ "value": s })),
                    _ => json!({}),
                }
            } else {
                // Si pas de conteneur, utiliser les clés restantes de l'objet
                let mut clean_args = serde_json::Map::new();
                for (k, v) in obj {
                    if k != "name" && k != "tool" && k != "tool_name" && k != "action" && k != "function" && k != "type" {
                        clean_args.insert(k.clone(), v.clone());
                    }
                }
                Value::Object(clean_args)
            };

            Some((name, params))
        };

        // 1. Détection des blocs de code Markdown (```tool_call, ```json, ou code brut ```lang:path)
        let marker = "```";
        let mut search_pos = 0;
        while let Some(start_idx) = text[search_pos..].find(marker) {
            let actual_start = search_pos + start_idx;
            let block_start = actual_start + marker.len();
            let line_end = text[block_start..].find('\n').unwrap_or(0);
            let content_start = block_start + line_end;

            if let Some(end_idx) = text[content_start..].find(marker) {
                let code_slice = text[content_start..content_start + end_idx].trim();
                let lang_line = text[block_start..block_start + line_end].trim();
                let lang_lower = lang_line.to_lowercase();

                let parsed_val = serde_json::from_str::<Value>(code_slice)
                    .ok()
                    .or_else(|| repair_json_string(code_slice));

                if let Some(val) = parsed_val {
                    if let Some(arr) = val.as_array() {
                        for item in arr {
                            if let Some(call) = extract_call(item) {
                                calls.push(call);
                            }
                        }
                    } else if let Some(call) = extract_call(&val) {
                        calls.push(call);
                    }
                } else if !code_slice.is_empty() {
                    // Si le bloc ressemble à une enveloppe tool_call mais n'a pas pu être parsé,
                    // ne pas le traiter comme du contenu brut de code source pour éviter d'écrire des enveloppes corrompues
                    if looks_like_tool_call_envelope(code_slice) {
                        search_pos = content_start + end_idx + marker.len();
                        continue;
                    }

                    // Heuristique : extraction automatique de write_file depuis un bloc de code
                    let mut found_path: Option<String> = None;
                    if let Some(colon_pos) = lang_line.find(':') {
                        let path_part = lang_line[colon_pos + 1..].trim();
                        if !path_part.is_empty() && !path_part.contains(' ') {
                            found_path = Some(path_part.to_string());
                        }
                    } else if let Some(eq_pos) = lang_line.find('=') {
                        let path_part = lang_line[eq_pos + 1..].trim().trim_matches('"').trim_matches('\'');
                        if !path_part.is_empty() {
                            found_path = Some(path_part.to_string());
                        }
                    } else {
                        // Chercher dans les 3 premières lignes (// filepath: src/app.ts ou # path: main.py)
                        for line in code_slice.lines().take(3) {
                            let l = line.trim();
                            if l.starts_with("//") || l.starts_with("#") || l.starts_with("/*") {
                                for prefix in &["filepath:", "file:", "path:", "src/", "app/"] {
                                    if let Some(pos) = l.find(prefix) {
                                        let candidate = l[pos + prefix.len()..].trim().trim_end_matches("*/").trim();
                                        let final_cand = if prefix.starts_with("src/") || prefix.starts_with("app/") {
                                            format!("{}{}", prefix, candidate)
                                        } else {
                                            candidate.to_string()
                                        };
                                        if !final_cand.is_empty() && (final_cand.contains('.') || final_cand.contains('/')) {
                                            found_path = Some(final_cand);
                                            break;
                                        }
                                    }
                                }
                            }
                            if found_path.is_some() { break; }
                        }

                        // Chercher dans le texte précédent immédiat (ex: Voici `src/App.tsx` :)
                        if found_path.is_none() && actual_start > 0 {
                            let mut lookback_start = actual_start.saturating_sub(250);
                            while lookback_start > 0 && !text.is_char_boundary(lookback_start) {
                                lookback_start -= 1;
                            }
                            let lookback = &text[lookback_start..actual_start];
                            for line in lookback.lines().rev().take(3) {
                                if let Some(b1) = line.find('`') {
                                    if let Some(b2) = line[b1 + 1..].find('`') {
                                        let cand = line[b1 + 1..b1 + 1 + b2].trim();
                                        if (cand.contains('.') || cand.contains('/')) && !cand.contains(' ') && cand.len() < 80 {
                                            found_path = Some(cand.to_string());
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if let Some(path) = found_path {
                        if !looks_like_tool_call_envelope(code_slice) {
                            calls.push(("write_file".to_string(), json!({
                                "path": path,
                                "content": code_slice
                            })));
                        }
                    } else if (lang_lower == "bash" || lang_lower == "sh" || lang_lower == "shell") && (code_slice.contains("cargo ") || code_slice.contains("npm ") || code_slice.contains("touch ") || code_slice.contains("mkdir ")) {
                        calls.push(("run_command".to_string(), json!({
                            "command": code_slice
                        })));
                    }
                }
                search_pos = content_start + end_idx + marker.len();
            } else {
                break;
            }
        }

        // 2. Détection format XML <tool_call>...</tool_call> ou <tool>...</tool>
        for (xml_start, xml_end) in [
            ("<tool_call>", "</tool_call>"),
            ("<tool>", "</tool>"),
            ("<invoke>", "</invoke>"),
        ] {
            let mut xml_pos = 0;
            while let Some(s_idx) = text[xml_pos..].find(xml_start) {
                let act_start = xml_pos + s_idx + xml_start.len();
                if let Some(e_idx) = text[act_start..].find(xml_end) {
                    let slice = text[act_start..act_start + e_idx].trim();
                    if let Ok(val) = serde_json::from_str::<Value>(slice) {
                        if let Some(call) = extract_call(&val) {
                            calls.push(call);
                        }
                    }
                    xml_pos = act_start + e_idx + xml_end.len();
                } else {
                    break;
                }
            }
        }

        // 3. Détection de JSON brut dans le texte si aucun appel n'a été trouvé
        if calls.is_empty() {
            let mut i = 0;
            let bytes = text.as_bytes();
            while i < bytes.len() {
                if bytes[i] == b'{' {
                    // Trouver le bloc d'accolades équilibré
                    let mut depth = 0;
                    let mut in_str = false;
                    let mut escape = false;
                    let mut j = i;
                    while j < bytes.len() {
                        let b = bytes[j];
                        if in_str {
                            if escape {
                                escape = false;
                            } else if b == b'\\' {
                                escape = true;
                            } else if b == b'"' {
                                in_str = false;
                            }
                        } else {
                            if b == b'"' {
                                in_str = true;
                            } else if b == b'{' {
                                depth += 1;
                            } else if b == b'}' {
                                depth -= 1;
                                if depth == 0 {
                                    // Bloc complet trouvé de i à j
                                    if let Ok(candidate) = std::str::from_utf8(&bytes[i..=j]) {
                                        let parsed_val = serde_json::from_str::<Value>(candidate.trim())
                                            .ok()
                                            .or_else(|| repair_json_string(candidate.trim()));
                                        if let Some(val) = parsed_val {
                                            if let Some(call) = extract_call(&val) {
                                                calls.push(call);
                                                i = j;
                                                break;
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                        j += 1;
                    }
                }
                i += 1;
            }
        }

        calls
    }

    /// Exécution d'un outil donné via le ToolRegistry et le CheckpointManager
    pub async fn execute_tool(
        &self,
        name: &str,
        args: &Value,
        tools: &ToolRegistry,
        checkpoints: &CheckpointManager,
    ) -> Result<Value, String> {
        // Normaliser les alias d'outils fréquents émis par les LLMs
        let canonical_name = match name.to_lowercase().as_str() {
            "write_file" | "create_file" | "new_file" | "touch" | "write" | "write_to_file" | "save_file" | "file_write" | "overwrite_file" | "put_file" | "create_new_file" => "write_file",
            "read_file" | "read" | "cat" | "view" | "view_file" | "open_file" | "load_file" | "file_read" | "read_file_content" | "show_file" => "read_file",
            "edit_file" | "edit" | "replace" | "modify_file" | "replace_content" | "replace_file" | "replace_file_content" | "str_replace" | "str_replace_editor" | "update_file" | "file_update" | "patch_file" | "patch" | "apply_diff" | "change_file" => "edit_file",
            "run_command" | "run" | "exec" | "bash" | "cmd" | "terminal" | "sh" | "execute_command" | "execute" | "shell" | "command" | "run_shell" | "execute_shell" | "terminal_run" | "run_cmd" | "system" => "run_command",
            "list_dir" | "list" | "ls" | "dir" | "list_directory" | "listdir" | "list_files" | "ls_dir" | "dir_list" => "list_dir",
            "glob_files" | "glob" | "find" | "find_files" | "find_file" | "file_search" => "glob_files",
            "grep_files" | "grep" | "search_files" | "ripgrep" | "rg" | "search_in_files" | "grep_search" | "text_search" => "grep_files",
            "delete_file" | "delete" | "remove" | "rm" | "remove_file" | "unlink" | "del" | "erase_file" => "delete_file",
            "move_file" | "move" | "rename" | "mv" | "rename_file" | "relocate_file" => "move_file",
            "create_dir" | "mkdir" | "make_dir" | "make_directory" | "create_directory" | "new_folder" | "create_folder" | "mkdir_p" => "create_dir",
            "web_search" | "search_web" | "google" | "ddg" | "search" | "internet_search" => "web_search",
            "fetch_url" | "read_url" | "browse" | "curl_url" | "download_url" | "curl" | "fetch" | "http_get" | "get_url" | "read_webpage" | "scrape_url" => "fetch_url",
            "todo_write" | "todos" | "todo" | "write_todos" | "update_todos" | "plan" | "task_list" | "tasks" => "todo_write",
            "search_semantic" | "semantic_search" | "code_search" | "find_symbol" => "search_semantic",
            "ast_grep" | "code_ast" | "find_functions" | "find_classes" => "ast_grep",
            "generate_project_docs" | "generate_docs" | "project_docs" | "architecture_docs" => "generate_project_docs",
            "inspect_sqlite_db" | "sqlite_query" | "sqlite" | "inspect_db" => "inspect_sqlite_db",
            "run_test_suite" | "run_tests" | "test_suite" | "tests" | "cargo_test" | "npm_test" | "pytest" | "test" | "run_test" => "run_test_suite",
            "check_http_service" | "check_port" | "healthcheck" | "check_service" | "ping_port" => "check_http_service",
            "calculate_code_metrics" | "code_metrics" | "metrics" | "loc" => "calculate_code_metrics",
            "inspect_binary" | "elf_inspect" | "binary_info" | "elf" => "inspect_binary",
            "profile_benchmark" | "benchmark" | "flamegraph" => "profile_benchmark",
            "analyze_local_image" | "vision" | "image_analysis" | "image" => "analyze_local_image",
            "save_learning" | "learn" | "add_learning" | "remember" | "record_learning" => "save_learning",
            "hybrid_search" | "search_hybrid" | "symbol_search" | "workspace_search" => "hybrid_search",
            "read_libreoffice_doc" | "read_doc" | "extract_doc_text" | "read_libreoffice" => "read_libreoffice_doc",
            "export_libreoffice_doc" | "export_libreoffice" | "libreoffice_export" | "convert_libreoffice" | "libreoffice_convert" | "export_doc" | "convert_doc" => "export_libreoffice_doc",
            "generate_libreoffice_template" | "generate_libreoffice" | "create_libreoffice_doc" | "libreoffice_template" | "create_doc" => "generate_libreoffice_template",
            _ => name,
        };

        // Créer un checkpoint avant toute modification destructrice ou écriture
        if matches!(canonical_name, "write_file" | "edit_file" | "delete_file" | "move_file" | "generate_libreoffice_template" | "export_libreoffice_doc") {
            let _ = checkpoints.create_checkpoint(&format!("Avant {}", canonical_name));
        }

        match canonical_name {
            "read_file" => {
                let path = args
                    .get("path")
                    .or_else(|| args.get("file"))
                    .or_else(|| args.get("filepath"))
                    .or_else(|| args.get("filename"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                let offset = args.get("offset").and_then(|o| o.as_u64()).map(|o| o as usize);
                let limit = args.get("limit").and_then(|l| l.as_u64()).map(|l| l as usize);
                if path.trim().is_empty() {
                    return Ok(json!({
                        "status": "error",
                        "error": "Le paramètre 'path' est obligatoire pour read_file",
                        "hint": "Spécifiez le chemin du fichier à lire visible dans l'arborescence (ex: read_file(path=\"src/App.tsx\"))"
                    }));
                }
                match tools.read_file(path, offset, limit) {
                    Ok(content) => Ok(json!({ "status": "success", "path": path, "content": content })),
                    Err(e) => Ok(json!({
                        "status": "error",
                        "error": e.to_string(),
                        "hint": "Consultez l'arborescence du projet visible dans le prompt système ou utilisez `list_dir(path=\"\")` pour voir les fichiers existants."
                    })),
                }
            }
            "write_file" => {
                let path = args
                    .get("path")
                    .or_else(|| args.get("file"))
                    .or_else(|| args.get("filepath"))
                    .or_else(|| args.get("filename"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                let content = args
                    .get("content")
                    .or_else(|| args.get("text"))
                    .or_else(|| args.get("code"))
                    .or_else(|| args.get("contents"))
                    .or_else(|| args.get("file_content"))
                    .or_else(|| args.get("body"))
                    .or_else(|| args.get("data"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("");
                if path.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'path' est obligatoire pour write_file" }));
                }
                let unpacked_content: Option<String> = if looks_like_tool_call_envelope(content) {
                    if let Some(repaired) = repair_json_string(content) {
                        repaired.get("parameters")
                            .or_else(|| repaired.get("arguments"))
                            .or_else(|| repaired.get("args"))
                            .and_then(|p| p.get("content").or_else(|| p.get("text")).or_else(|| p.get("code")))
                            .or_else(|| repaired.get("content"))
                            .and_then(|c| c.as_str())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                } else {
                    None
                };

                let final_content = if looks_like_tool_call_envelope(content) {
                    if let Some(ref inner) = unpacked_content {
                        inner.as_str()
                    } else {
                        return Ok(json!({
                            "status": "error",
                            "error": "Contenu rejeté : détection d'une enveloppe tool_call JSON malformée qui écraserait le fichier source."
                        }));
                    }
                } else {
                    content
                };
                match tools.write_file(path, final_content) {
                    Ok(bytes) => {
                        let lint_warnings = ToolRegistry::detect_missing_imports(path, final_content);
                        Ok(json!({
                            "status": "success",
                            "bytes_written": bytes,
                            "path": path,
                            "lint_warnings": lint_warnings
                        }))
                    }
                    Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
                }
            }
            "edit_file" => {
                let path = args
                    .get("path")
                    .or_else(|| args.get("file"))
                    .or_else(|| args.get("filepath"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                let target = args
                    .get("target_content")
                    .or_else(|| args.get("target"))
                    .or_else(|| args.get("old_content"))
                    .or_else(|| args.get("old_str"))
                    .or_else(|| args.get("old_string"))
                    .or_else(|| args.get("search"))
                    .or_else(|| args.get("original"))
                    .or_else(|| args.get("old"))
                    .or_else(|| args.get("source"))
                    .or_else(|| args.get("find"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                let replacement = args
                    .get("replacement_content")
                    .or_else(|| args.get("replacement"))
                    .or_else(|| args.get("new_content"))
                    .or_else(|| args.get("new_str"))
                    .or_else(|| args.get("new_string"))
                    .or_else(|| args.get("replace_content"))
                    .or_else(|| args.get("replacement_text"))
                    .or_else(|| args.get("new"))
                    .or_else(|| args.get("replace"))
                    .and_then(|r| r.as_str())
                    .unwrap_or("");
                if path.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'path' est obligatoire pour edit_file" }));
                }
                let unpacked_replacement: Option<String> = if looks_like_tool_call_envelope(replacement) {
                    if let Some(repaired) = repair_json_string(replacement) {
                        repaired.get("parameters")
                            .or_else(|| repaired.get("arguments"))
                            .or_else(|| repaired.get("args"))
                            .and_then(|p| p.get("replacement_content").or_else(|| p.get("new_content")))
                            .and_then(|c| c.as_str())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                } else {
                    None
                };

                let final_replacement = if looks_like_tool_call_envelope(replacement) {
                    if let Some(ref inner) = unpacked_replacement {
                        inner.as_str()
                    } else {
                        return Ok(json!({
                            "status": "error",
                            "error": "Contenu de remplacement rejeté : détection d'une enveloppe tool_call JSON malformée qui écraserait le fichier source."
                        }));
                    }
                } else {
                    replacement
                };
                match tools.edit_file(path, target, final_replacement) {
                    Ok(_) => {
                        let lint_warnings = if let Ok(full_content) = tools.read_file(path, None, None) {
                            ToolRegistry::detect_missing_imports(path, &full_content)
                        } else {
                            Vec::new()
                        };
                        Ok(json!({
                            "status": "success",
                            "modified": path,
                            "lint_warnings": lint_warnings
                        }))
                    }
                    Err(e) => Ok(json!({
                        "status": "error",
                        "error": e.to_string(),
                        "hint": "Si le fichier n'existe pas encore, utilisez `write_file`. Si le bloc n'a pas été trouvé, lisez d'abord le fichier avec `read_file`."
                    })),
                }
            }
            "list_dir" => {
                let path = args
                    .get("path")
                    .or_else(|| args.get("dir"))
                    .or_else(|| args.get("directory"))
                    .or_else(|| args.get("folder"))
                    .or_else(|| args.get("target"))
                    .and_then(|p| p.as_str());
                let recursive = args.get("recursive").and_then(|r| r.as_bool()).unwrap_or(false);
                let max_depth = args.get("max_depth").and_then(|d| d.as_u64()).map(|d| d as usize);
                match tools.list_dir(path, recursive, max_depth) {
                    Ok(entries) => {
                        let total = entries.len();
                        Ok(json!({
                            "status": "success",
                            "folder": path.unwrap_or("racine"),
                            "total_entries": total,
                            "entries": entries
                        }))
                    }
                    Err(e) => Ok(json!({
                        "status": "error",
                        "error": e.to_string(),
                        "hint": "Utilisez `list_dir(path=\"\")` pour lister la racine ou vérifiez l'existence du sous-dossier."
                    })),
                }
            }
            "glob_files" => {
                let pattern = args
                    .get("pattern")
                    .or_else(|| args.get("glob"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("*");
                match tools.glob_files(pattern) {
                    Ok(matches) => Ok(json!({ "status": "success", "pattern": pattern, "matches": matches })),
                    Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
                }
            }
            "grep_files" => {
                let pattern = args
                    .get("pattern")
                    .or_else(|| args.get("query"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                let path = args
                    .get("path")
                    .or_else(|| args.get("dir"))
                    .or_else(|| args.get("directory"))
                    .and_then(|p| p.as_str());
                let case_sensitive = args.get("case_sensitive").and_then(|c| c.as_bool()).unwrap_or(false);
                match tools.grep_files(pattern, path, case_sensitive) {
                    Ok(matches) => Ok(json!({ "status": "success", "pattern": pattern, "matches": matches })),
                    Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
                }
            }
            "run_command" => {
                let cmd = args
                    .get("command")
                    .or_else(|| args.get("cmd"))
                    .or_else(|| args.get("script"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("");
                if cmd.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'command' est obligatoire pour run_command" }));
                }
                match tools.run_command(cmd).await {
                    Ok(out) => Ok(json!(out)),
                    Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
                }
            }
            "delete_file" => {
                let path = args
                    .get("path")
                    .or_else(|| args.get("file"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                if path.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'path' est obligatoire pour delete_file" }));
                }
                match tools.delete_file(path) {
                    Ok(_) => Ok(json!({ "status": "success", "deleted": path })),
                    Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
                }
            }
            "move_file" => {
                let source = args
                    .get("source")
                    .or_else(|| args.get("from"))
                    .or_else(|| args.get("src"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("");
                let dest = args
                    .get("destination")
                    .or_else(|| args.get("to"))
                    .or_else(|| args.get("dest"))
                    .and_then(|d| d.as_str())
                    .unwrap_or("");
                if source.trim().is_empty() || dest.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "'source' et 'destination' sont requis pour move_file" }));
                }
                match tools.move_file(source, dest) {
                    Ok(_) => Ok(json!({ "status": "success", "source": source, "destination": dest })),
                    Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
                }
            }
            "create_dir" => {
                let path = args
                    .get("path")
                    .or_else(|| args.get("dir"))
                    .or_else(|| args.get("directory"))
                    .or_else(|| args.get("name"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                if path.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'path' est obligatoire pour create_dir" }));
                }
                match tools.create_dir(path) {
                    Ok(_) => Ok(json!({ "status": "success", "created_dir": path })),
                    Err(e) => Ok(json!({ "status": "error", "error": e.to_string() })),
                }
            }
            "todo_write" => {
                let todos = args.get("todos").cloned().unwrap_or(json!([]));
                let next_task = todos.as_array()
                    .and_then(|arr| arr.iter().find(|t| t.get("status").and_then(|s| s.as_str()) != Some("done")))
                    .and_then(|t| t.get("task").and_then(|tk| tk.as_str()))
                    .unwrap_or("la première tâche");
                Ok(json!({
                    "status": "todos_updated",
                    "todos": todos,
                    "instruction": format!("Plan enregistré avec succès. Maintenant, INTERDICTION formelle d'appeler à nouveau `todo_write` : passe DIRECTEMENT à la réalisation concrète de : '{}'. Appelle immédiatement `write_file`, `create_dir` ou `edit_file` pour créer ou modifier les fichiers sur le disque.", next_task)
                }))
            }
            "web_search" => {
                let query = args
                    .get("query")
                    .or_else(|| args.get("q"))
                    .or_else(|| args.get("search"))
                    .and_then(|q| q.as_str())
                    .unwrap_or("");
                let limit = args.get("limit").and_then(|l| l.as_u64()).map(|l| l as usize);
                if query.trim().is_empty() {
                    return Err("Le paramètre 'query' est obligatoire pour web_search".to_string());
                }
                tools
                    .web_search(query, limit)
                    .await
                    .map(|results| json!({ "query": query, "results": results }))
                    .map_err(|e| e.to_string())
            }
            "fetch_url" => {
                let url = args
                    .get("url")
                    .or_else(|| args.get("link"))
                    .and_then(|u| u.as_str())
                    .unwrap_or("");
                if url.trim().is_empty() {
                    return Err("Le paramètre 'url' est obligatoire pour fetch_url".to_string());
                }
                tools
                    .fetch_url(url)
                    .await
                    .map(|content| json!({ "url": url, "content": content }))
                    .map_err(|e| e.to_string())
            }
            "search_semantic" => {
                let query = args
                    .get("query")
                    .or_else(|| args.get("q"))
                    .and_then(|q| q.as_str())
                    .unwrap_or("");
                let limit = args.get("limit").and_then(|l| l.as_u64()).map(|l| l as usize);
                if query.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'query' est obligatoire pour search_semantic" }));
                }
                tools
                    .search_semantic(query, limit)
                    .map(|results| json!({ "status": "success", "query": query, "results": results }))
                    .map_err(|e| e.to_string())
            }
            "ast_grep" => {
                let query = args
                    .get("query")
                    .or_else(|| args.get("pattern"))
                    .or_else(|| args.get("symbol"))
                    .and_then(|q| q.as_str())
                    .unwrap_or("");
                let kind = args.get("kind").and_then(|k| k.as_str());
                let path = args.get("path").and_then(|p| p.as_str());
                if query.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'query' est obligatoire pour ast_grep" }));
                }
                tools
                    .ast_grep(query, kind, path)
                    .map(|matches| json!({ "status": "success", "matches": matches }))
                    .map_err(|e| e.to_string())
            }
            "generate_project_docs" => {
                tools
                    .generate_project_docs()
                    .map(|docs| json!({ "status": "success", "markdown_docs": docs }))
                    .map_err(|e| e.to_string())
            }
            "inspect_sqlite_db" => {
                let path = args
                    .get("path")
                    .or_else(|| args.get("db"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                let query = args.get("query").or_else(|| args.get("sql")).and_then(|q| q.as_str());
                if path.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'path' est obligatoire pour inspect_sqlite_db" }));
                }
                tools
                    .inspect_sqlite_db(path, query)
                    .map(|data| json!({ "status": "success", "data": data }))
                    .map_err(|e| e.to_string())
            }
            "run_test_suite" => {
                tools
                    .run_test_suite()
                    .await
                    .map(|test_res| json!({ "status": "success", "results": test_res }))
                    .map_err(|e| e.to_string())
            }
            "check_http_service" => {
                let port = args
                    .get("port")
                    .and_then(|p| p.as_u64())
                    .unwrap_or(8080) as u16;
                let path = args.get("path").and_then(|p| p.as_str());
                tools
                    .check_http_service(port, path)
                    .await
                    .map(|report| json!({ "status": "success", "report": report }))
                    .map_err(|e| e.to_string())
            }
            "calculate_code_metrics" => {
                let path = args.get("path").and_then(|p| p.as_str());
                tools
                    .calculate_code_metrics(path)
                    .map(|metrics| json!({ "status": "success", "metrics": metrics }))
                    .map_err(|e| e.to_string())
            }
            "inspect_binary" => {
                let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
                if path.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'path' est obligatoire pour inspect_binary" }));
                }
                tools.inspect_binary(path).map_err(|e| e.to_string())
            }
            "profile_benchmark" => {
                let command = args.get("command").or_else(|| args.get("cmd")).and_then(|c| c.as_str()).unwrap_or("");
                if command.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'command' est obligatoire pour profile_benchmark" }));
                }
                tools.profile_benchmark(command).await.map_err(|e| e.to_string())
            }
            "analyze_local_image" => {
                let path = args.get("path").or_else(|| args.get("image")).and_then(|p| p.as_str()).unwrap_or("");
                let prompt = args.get("prompt").and_then(|p| p.as_str());
                if path.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'path' est obligatoire pour analyze_local_image" }));
                }
                tools.analyze_local_image(path, prompt).await.map_err(|e| e.to_string())
            }
            "save_learning" => {
                let category = args.get("category").and_then(|c| c.as_str()).unwrap_or("convention");
                let title = args.get("title").and_then(|t| t.as_str()).unwrap_or("Nouvelle convention");
                let content = args.get("content").and_then(|c| c.as_str()).unwrap_or("");
                let item = LearningItem {
                    id: uuid::Uuid::new_v4().to_string(),
                    category: category.to_string(),
                    title: title.to_string(),
                    content: content.to_string(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                };
                match Self::save_learning_to_file(tools.workspace_root(), item.clone()) {
                    Ok(_) => Ok(json!({
                        "status": "success",
                        "learning_saved": item,
                        "message": "Apprentissage enregistré avec succès dans .localagent/learnings.json."
                    })),
                    Err(e) => Ok(json!({ "status": "error", "error": e })),
                }
            }
            "hybrid_search" => {
                let query = args.get("query").or_else(|| args.get("q")).and_then(|q| q.as_str()).unwrap_or("");
                let limit = args.get("limit").and_then(|l| l.as_u64()).map(|l| l as usize);
                tools
                    .hybrid_search(query, limit)
                    .map(|results| json!({ "status": "success", "results": results }))
                    .map_err(|e| e.to_string())
            }
            "export_libreoffice_doc" => {
                let source_path = args.get("source_path").or_else(|| args.get("path")).or_else(|| args.get("file")).and_then(|p| p.as_str()).unwrap_or("");
                let target_format = args.get("target_format").or_else(|| args.get("format")).and_then(|f| f.as_str()).unwrap_or("odt");
                let outdir = args.get("outdir").and_then(|o| o.as_str());
                if source_path.trim().is_empty() {
                    return Ok(json!({ "status": "error", "error": "Le paramètre 'source_path' est obligatoire pour export_libreoffice_doc" }));
                }
                tools.export_libreoffice_doc(source_path, target_format, outdir).await.map_err(|e| e.to_string())
            }
            "generate_libreoffice_template" => {
                let app_type = args.get("app_type").or_else(|| args.get("app")).and_then(|a| a.as_str()).unwrap_or("writer");
                let path = args.get("path").or_else(|| args.get("file")).and_then(|p| p.as_str()).unwrap_or("document.odt");
                let title = args.get("title").and_then(|t| t.as_str()).unwrap_or("Document LibreOffice");
                let content = args.get("content").or_else(|| args.get("text")).or_else(|| args.get("data")).and_then(|c| c.as_str()).unwrap_or("");
                tools.generate_libreoffice_template(app_type, path, title, content).await.map_err(|e| e.to_string())
            }
            "read_libreoffice_doc" => {
                let path = args
                    .get("path")
                    .or_else(|| args.get("file"))
                    .or_else(|| args.get("filepath"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                if path.trim().is_empty() {
                    return Ok(json!({
                        "status": "error",
                        "error": "Le paramètre 'path' est obligatoire pour read_libreoffice_doc"
                    }));
                }
                tools.read_libreoffice_doc(path).await.map_err(|e| e.to_string())
            }
            unknown => {
                // Heuristique 1 : si l'outil inconnu a un argument 'command' ou 'cmd', exécuter run_command
                if let Some(cmd) = args.get("command").or_else(|| args.get("cmd")).and_then(|c| c.as_str()) {
                    if !cmd.trim().is_empty() {
                        return tools
                            .run_command(cmd)
                            .await
                            .map(|out| json!(out))
                            .map_err(|e| e.to_string());
                    }
                }

                // Heuristique 2 : si l'outil a un argument 'content' ou 'text', exécuter write_file
                if let Some(content) = args.get("content").or_else(|| args.get("text")).and_then(|c| c.as_str()) {
                    let path = args.get("path").and_then(|p| p.as_str()).unwrap_or(unknown);
                    return tools
                        .write_file(path, content)
                        .map(|bytes| json!({ "status": "success", "bytes_written": bytes, "path": path, "note": format!("Outil '{}' interprété comme write_file", unknown) }))
                        .map_err(|e| e.to_string());
                }

                // Heuristique 3 : si l'outil a un argument 'path' ou s'il s'agit d'un nom de projet/jeu
                // (comme "my_game"), créer le répertoire pour le projet !
                let possible_path = args.get("path")
                    .or_else(|| args.get("dir"))
                    .or_else(|| args.get("name"))
                    .and_then(|p| p.as_str())
                    .unwrap_or(unknown);

                let is_file_op = unknown.contains("file") || unknown.contains("edit") || unknown.contains("replace") || unknown.contains("content") || unknown.contains("read") || unknown.contains("write") || unknown.contains("cmd") || unknown.contains("run");
                if !is_file_op && !possible_path.trim().is_empty() && (unknown.contains('_') || unknown.contains('-') || unknown.ends_with("game") || unknown.ends_with("app") || unknown.ends_with("project")) {
                    if let Ok(_) = tools.create_dir(possible_path) {
                        return Ok(json!({
                            "status": "created",
                            "path": possible_path,
                            "note": format!("Outil '{}' interprété comme création de dossier `create_dir`", unknown)
                        }));
                    }
                }

                // Si aucune heuristique ne correspond, retourner un retour guidé structuré pour que le LLM corrige son tir
                Ok(json!({
                    "status": "error",
                    "error": format!("Outil inconnu : '{}'. Tu ne dois PAS inventer de noms d'outils. Outils autorisés : write_file (créer/écrire un fichier), create_dir (créer un dossier), read_file (lire), edit_file (modifier), run_command (commande shell), web_search (recherche internet), fetch_url (lire une page web), list_dir, todo_write. Reformule avec un de ces outils.", unknown)
                }))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_fallback_tool_calls_markdown_tool_call() {
        let text = "Voici l'action :\n```tool_call\n{\"name\": \"write_file\", \"parameters\": {\"path\": \"demo.txt\", \"content\": \"hello\"}}\n```\n";
        let calls = AgentEngine::parse_fallback_tool_calls(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "write_file");
        assert_eq!(calls[0].1["path"], "demo.txt");
        assert_eq!(calls[0].1["content"], "hello");
    }

    #[test]
    fn test_parse_fallback_tool_calls_markdown_json() {
        let text = "Je vais créer le fichier pour vous :\n```json\n{\n  \"name\": \"create_file\",\n  \"arguments\": {\n    \"path\": \"tst.txt\"\n  }\n}\n```";
        let calls = AgentEngine::parse_fallback_tool_calls(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "create_file");
        assert_eq!(calls[0].1["path"], "tst.txt");
    }

    #[test]
    fn test_parse_fallback_tool_calls_raw_json_in_text() {
        let text = "Bien sûr, je m'en occupe : {\"name\": \"create_file\", \"arguments\": {\"path\": \"tst.txt\"}} terminé.";
        let calls = AgentEngine::parse_fallback_tool_calls(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "create_file");
        assert_eq!(calls[0].1["path"], "tst.txt");
    }

    #[test]
    fn test_parse_fallback_tool_calls_top_level_arguments() {
        let text = "Action : {\"name\": \"touch\", \"path\": \"new_file.rs\"}";
        let calls = AgentEngine::parse_fallback_tool_calls(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "touch");
        assert_eq!(calls[0].1["path"], "new_file.rs");
    }

    #[test]
    fn test_parse_fallback_tool_calls_xml() {
        let text = "<tool_call>{\"name\": \"run_command\", \"arguments\": {\"command\": \"ls -la\"}}</tool_call>";
        let calls = AgentEngine::parse_fallback_tool_calls(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "run_command");
        assert_eq!(calls[0].1["command"], "ls -la");
    }

    #[tokio::test]
    async fn test_execute_tool_create_file_alias_without_content() {
        let temp_dir = tempfile::tempdir().unwrap();
        let ws_path = temp_dir.path().to_path_buf();
        let config = crate::security::SandboxConfig::default();
        let tools = ToolRegistry::new(&ws_path, config).unwrap();
        let checkpoints = CheckpointManager::new(&ws_path).unwrap();

        let engine = AgentEngine::new(
            ModelProfile {
                name: "test".to_string(),
                api_url: "http://localhost:11434/v1".to_string(),
                model_id: "qwen2.5-coder:1.5b".to_string(),
                api_key: None,
                temperature: 0.2,
                max_tokens: 1000,
                num_ctx: None,
                supports_native_tools: false,
            },
            ApprovalMode::Yolo,
        );

        let calls = AgentEngine::parse_fallback_tool_calls(
            "```json\n{\"name\": \"create_file\", \"arguments\": {\"path\": \"tst.txt\"}}\n```"
        );
        assert_eq!(calls.len(), 1);
        let (fn_name, fn_args) = &calls[0];

        let result = engine.execute_tool(fn_name, fn_args, &tools, &checkpoints).await;
        assert!(result.is_ok(), "Tool execution should succeed: {:?}", result);
        assert!(ws_path.join("tst.txt").exists(), "tst.txt should be created");
    }

    #[tokio::test]
    async fn test_execute_tool_my_game_heuristic_handling() {
        let temp_dir = tempfile::tempdir().unwrap();
        let ws_path = temp_dir.path().to_path_buf();
        let config = crate::security::SandboxConfig::default();
        let tools = ToolRegistry::new(&ws_path, config).unwrap();
        let checkpoints = CheckpointManager::new(&ws_path).unwrap();

        let engine = AgentEngine::new(
            ModelProfile {
                name: "test".to_string(),
                api_url: "http://localhost:11434/v1".to_string(),
                model_id: "qwen2.5-coder:1.5b".to_string(),
                api_key: None,
                temperature: 0.2,
                max_tokens: 1000,
                num_ctx: None,
                supports_native_tools: false,
            },
            ApprovalMode::Yolo,
        );

        let result = engine.execute_tool("my_game", &json!({ "path": "my_game" }), &tools, &checkpoints).await;
        assert!(result.is_ok(), "Tool execution should succeed: {:?}", result);
        assert!(ws_path.join("my_game").exists(), "Le dossier my_game doit être créé par l'heuristique");
    }

    #[test]
    fn test_safe_truncate_str_ascii() {
        let text = "hello world";
        assert_eq!(safe_truncate_str(text, 5), "hello");
        assert_eq!(safe_truncate_str(text, 11), "hello world");
        assert_eq!(safe_truncate_str(text, 20), "hello world");
        assert_eq!(safe_truncate_str(text, 0), "");
    }

    #[test]
    fn test_safe_truncate_str_multibyte_utf8() {
        // "café" -> 'c' (1), 'a' (1), 'f' (1), 'é' (2 bytes, indices 3..5)
        let s = "café";
        assert_eq!(s.len(), 5);
        assert_eq!(safe_truncate_str(s, 5), "café");
        assert_eq!(safe_truncate_str(s, 4), "caf"); // 4 lands inside 'é', truncates to 3
        assert_eq!(safe_truncate_str(s, 3), "caf");
        assert_eq!(safe_truncate_str(s, 2), "ca");
        assert_eq!(safe_truncate_str(s, 1), "c");

        // "🦀 Rust 🚀"
        // '🦀' is 4 bytes [0..4]
        // ' ' is 1 byte [4..5]
        // 'Rust ' is 5 bytes [5..10]
        // '🚀' is 4 bytes [10..14]
        let emoji_str = "🦀 Rust 🚀";
        assert_eq!(safe_truncate_str(emoji_str, 1), "");
        assert_eq!(safe_truncate_str(emoji_str, 2), "");
        assert_eq!(safe_truncate_str(emoji_str, 3), "");
        assert_eq!(safe_truncate_str(emoji_str, 4), "🦀");
        assert_eq!(safe_truncate_str(emoji_str, 5), "🦀 ");
        assert_eq!(safe_truncate_str(emoji_str, 12), "🦀 Rust ");
        assert_eq!(safe_truncate_str(emoji_str, 14), "🦀 Rust 🚀");
    }

    #[test]
    fn test_extract_and_strip_think_tags_standard() {
        let raw = "<think>Analyzing user request...</think>Here is the response.";
        let (thought, text) = extract_and_strip_think_tags(raw);
        assert_eq!(thought, Some("Analyzing user request...".to_string()));
        assert_eq!(text, "Here is the response.");
    }

    #[test]
    fn test_extract_and_strip_think_tags_unclosed() {
        let raw = "<think>Still thinking and model hit context limit";
        let (thought, text) = extract_and_strip_think_tags(raw);
        assert_eq!(thought, Some("Still thinking and model hit context limit".to_string()));
        assert_eq!(text, "");

        let raw_with_prefix = "Hello! <think>Generating partial thought";
        let (thought2, text2) = extract_and_strip_think_tags(raw_with_prefix);
        assert_eq!(thought2, Some("Generating partial thought".to_string()));
        assert_eq!(text2, "Hello!");
    }

    #[test]
    fn test_extract_and_strip_think_tags_missing_open_or_stray_close() {
        let raw = "Here is an answer </think> with stray closing tag.";
        let (thought, text) = extract_and_strip_think_tags(raw);
        assert_eq!(thought, None);
        assert_eq!(text, "Here is an answer  with stray closing tag.");
    }

    #[test]
    fn test_extract_and_strip_think_tags_inverted() {
        let raw = "</think> stray before <think>real thought</think> final answer";
        let (thought, text) = extract_and_strip_think_tags(raw);
        assert_eq!(thought, Some("real thought".to_string()));
        assert_eq!(text, "stray before  final answer");

        let raw_inverted_unclosed = "</think> prefix <think>unclosed thought";
        let (thought2, text2) = extract_and_strip_think_tags(raw_inverted_unclosed);
        assert_eq!(thought2, Some("unclosed thought".to_string()));
        assert_eq!(text2, "prefix");
    }

    #[test]
    fn test_extract_and_strip_think_tags_multiple_and_empty() {
        let raw = "<think>First thought</think> mid text <think>Second thought</think> end";
        let (thought, text) = extract_and_strip_think_tags(raw);
        assert_eq!(thought, Some("First thought\n\nSecond thought".to_string()));
        assert_eq!(text, "mid text  end");

        let raw_empty = "<think></think>Clean answer";
        let (thought2, text2) = extract_and_strip_think_tags(raw_empty);
        assert_eq!(thought2, None);
        assert_eq!(text2, "Clean answer");

        let raw_none = "No think tags here";
        let (thought3, text3) = extract_and_strip_think_tags(raw_none);
        assert_eq!(thought3, None);
        assert_eq!(text3, "No think tags here");
    }

    #[test]
    fn test_compact_conversation_history_tool_pairing() {
        let messages = vec![
            json!({ "role": "system", "content": "You are a coding agent" }),
            json!({ "role": "user", "content": "Start project" }),
            json!({ "role": "assistant", "content": "", "tool_calls": [{ "id": "call_1", "function": { "name": "run_command" } }] }),
            json!({ "role": "tool", "tool_call_id": "call_1", "content": "ok" }),
            json!({ "role": "assistant", "content": "done step 1" }),
            json!({ "role": "user", "content": "continue" }),
            json!({ "role": "assistant", "content": "", "tool_calls": [{ "id": "call_2" }, { "id": "call_3" }] }),
            json!({ "role": "tool", "tool_call_id": "call_2", "content": "res2" }),
            json!({ "role": "tool", "tool_call_id": "call_3", "content": "res3" }),
            json!({ "role": "assistant", "content": "done step 2" }),
        ];

        let compacted = compact_conversation_history(&messages, 2);

        assert_eq!(compacted[0]["role"], "system");
        assert_eq!(compacted[0]["content"], "You are a coding agent");
        assert_eq!(compacted[1]["role"], "user");
        assert_eq!(compacted[1]["content"], "Start project");
        assert_eq!(compacted[2]["role"], "system");

        assert_eq!(compacted[3]["role"], "assistant");
        assert!(compacted[3].get("tool_calls").is_some(), "Compacted history must start with assistant tool_calls");
        assert_eq!(compacted[4]["role"], "tool");
        assert_eq!(compacted[4]["tool_call_id"], "call_2");
        assert_eq!(compacted[5]["role"], "tool");
        assert_eq!(compacted[5]["tool_call_id"], "call_3");
        assert_eq!(compacted[6]["role"], "assistant");
        assert_eq!(compacted[6]["content"], "done step 2");

        let compacted_3 = compact_conversation_history(&messages, 3);
        assert_eq!(compacted_3[3]["role"], "assistant");
        assert!(compacted_3[3].get("tool_calls").is_some());
    }

    #[test]
    fn test_compact_conversation_history_short_conversations() {
        let short = vec![
            json!({ "role": "system", "content": "sys" }),
            json!({ "role": "user", "content": "hello" }),
        ];
        let res = compact_conversation_history(&short, 4);
        assert_eq!(res.len(), 2);
    }

    #[test]
    fn test_looks_like_tool_call_envelope_checks() {
        let valid_json = "{\"name\": \"write_file\", \"parameters\": {\"path\": \"test.rs\", \"content\": \"code\"}}";
        assert!(looks_like_tool_call_envelope(valid_json));

        let malformed_json = "{\"name\": \"write_file\", \"arguments\": {\"path\": \"unclosed";
        assert!(looks_like_tool_call_envelope(malformed_json));

        let xml_envelope = "<tool_call>{\"name\": \"run_command\"}</tool_call>";
        assert!(looks_like_tool_call_envelope(xml_envelope));

        let regular_code = "fn main() {\n    println!(\"Hello world\");\n}";
        assert!(!looks_like_tool_call_envelope(regular_code));

        let config_json = "{\"name\": \"my-app\", \"version\": \"1.0.0\", \"description\": \"sample\"}";
        assert!(!looks_like_tool_call_envelope(config_json));
    }

    #[test]
    fn test_repair_json_string() {
        let with_fences = "```json\n{\"name\": \"write_file\", \"parameters\": {\"path\": \"foo.txt\"}}\n```";
        let repaired = repair_json_string(with_fences);
        assert!(repaired.is_some());
        assert_eq!(repaired.unwrap()["name"], "write_file");

        let trailing_comma = "{\"name\": \"edit_file\", \"parameters\": {\"path\": \"bar.txt\",},}";
        let repaired2 = repair_json_string(trailing_comma);
        assert!(repaired2.is_some());
        assert_eq!(repaired2.unwrap()["name"], "edit_file");
    }

    #[tokio::test]
    async fn test_execute_fallback_tool_rejects_malformed_envelope() {
        let temp_dir = tempfile::tempdir().unwrap();
        let ws_path = temp_dir.path().to_path_buf();
        let config = crate::security::SandboxConfig::default();
        let tools = ToolRegistry::new(&ws_path, config).unwrap();
        let checkpoints = CheckpointManager::new(&ws_path).unwrap();

        let engine = AgentEngine::new(
            ModelProfile {
                name: "test".to_string(),
                api_url: "http://localhost:11434/v1".to_string(),
                model_id: "qwen2.5-coder:1.5b".to_string(),
                api_key: None,
                temperature: 0.2,
                max_tokens: 1000,
                num_ctx: None,
                supports_native_tools: false,
            },
            ApprovalMode::Yolo,
        );

        let malformed_envelope = "{\"name\": \"write_file\", \"parameters\": {\"path\": \"broken_envelope.rs\", broken json";
        let res = engine.execute_fallback_tool(
            "write_file",
            &json!({ "path": "src/bad.rs", "content": malformed_envelope }),
            &tools,
            &checkpoints,
        ).await;

        assert!(res.is_ok());
        let val = res.unwrap();
        assert_eq!(val["status"], "error");
        assert!(val["error"].as_str().unwrap().contains("détection d'une enveloppe tool_call JSON malformée"));
        assert!(!ws_path.join("src/bad.rs").exists(), "Malformed envelope must not be written to file");
    }
}
