use std::path::Path;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "modified", "added", "deleted", "untracked", "renamed"
    pub staged: bool,
    pub raw_code: String, // "M", "A", "D", "??", "R"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub is_repo: bool,
    #[serde(default)]
    pub is_git_repo: bool,
    pub branch: String,
    #[serde(default)]
    pub current_branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<GitFileStatus>,
    pub unstaged: Vec<GitFileStatus>,
    pub untracked: Vec<GitFileStatus>,
    #[serde(default)]
    pub is_clean: bool,
    #[serde(default)]
    pub files: Vec<GitFileStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

pub struct GitManager;

impl GitManager {
    /// Vérifie si le dossier est un dépôt Git valide
    pub fn is_git_repo(ws_root: &Path) -> bool {
        ws_root.join(".git").exists()
    }

    /// Prépare une commande git avec l'option -c core.quotepath=false pour préserver les caractères accentués/non-ASCII
    fn git_cmd(ws_root: &Path) -> Command {
        let mut cmd = Command::new("git");
        cmd.args(&["-c", "core.quotepath=false"]);
        cmd.current_dir(ws_root);
        cmd
    }

    /// Récupère le statut complet du dépôt Git
    pub fn get_status(ws_root: &Path) -> Result<GitStatus, String> {
        if !Self::is_git_repo(ws_root) {
            return Ok(GitStatus {
                is_repo: false,
                is_git_repo: false,
                branch: String::new(),
                current_branch: String::new(),
                ahead: 0,
                behind: 0,
                staged: Vec::new(),
                unstaged: Vec::new(),
                untracked: Vec::new(),
                is_clean: true,
                files: Vec::new(),
            });
        }

        let output = Self::git_cmd(ws_root)
            .args(&["status", "--porcelain=v1", "-b"])
            .output()
            .map_err(|e| format!("Erreur exécution git status : {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Git error: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut branch = String::from("main");
        let mut ahead = 0;
        let mut behind = 0;
        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();

        for line in stdout.lines() {
            if line.starts_with("##") {
                // Header de branche : ex: ## master...origin/master [ahead 1]
                let branch_info = line[2..].trim();
                let clean_info = branch_info
                    .trim_start_matches("Initial commit on ")
                    .trim_start_matches("No commits yet on ");
                let parts: Vec<&str> = clean_info.split("...").collect();
                if let Some(b) = parts.first() {
                    let b_name = b.trim();
                    if !b_name.is_empty() {
                        branch = b_name.to_string();
                    }
                }
                if branch_info.contains("[ahead ") || branch_info.contains("ahead ") {
                    if let Some(pos) = branch_info.find("ahead ") {
                        let sub = &branch_info[pos + 6..];
                        if let Some(end) = sub.find(|c: char| c == ']' || c == ',') {
                            ahead = sub[..end].trim().parse().unwrap_or(0);
                        }
                    }
                }
                if branch_info.contains("behind ") {
                    if let Some(pos) = branch_info.find("behind ") {
                        let sub = &branch_info[pos + 7..];
                        if let Some(end) = sub.find(|c: char| c == ']' || c == ',') {
                            behind = sub[..end].trim().parse().unwrap_or(0);
                        }
                    }
                }
            } else if line.len() >= 3 {
                let bytes = line.as_bytes();
                let index_char = bytes[0] as char;
                let worktree_char = bytes[1] as char;
                let raw_path = line[3..].trim();
                let clean_path = raw_path.trim_matches('"');
                let path_str = if let Some(target) = clean_path.split(" -> ").nth(1) {
                    target.trim().to_string()
                } else {
                    clean_path.to_string()
                };

                if index_char == '?' && worktree_char == '?' {
                    untracked.push(GitFileStatus {
                        path: path_str,
                        status: "untracked".to_string(),
                        staged: false,
                        raw_code: "??".to_string(),
                    });
                } else if index_char == '!' && worktree_char == '!' {
                    // Ignoré, ignorer
                    continue;
                } else {
                    if index_char != ' ' {
                        let status_desc = match index_char {
                            'A' => "added",
                            'M' => "modified",
                            'D' => "deleted",
                            'R' => "renamed",
                            'C' => "copied",
                            _ => "modified",
                        };
                        staged.push(GitFileStatus {
                            path: path_str.clone(),
                            status: status_desc.to_string(),
                            staged: true,
                            raw_code: index_char.to_string(),
                        });
                    }

                    if worktree_char != ' ' {
                        let status_desc = match worktree_char {
                            'M' => "modified",
                            'D' => "deleted",
                            'A' => "added",
                            _ => "modified",
                        };
                        unstaged.push(GitFileStatus {
                            path: path_str.clone(),
                            status: status_desc.to_string(),
                            staged: false,
                            raw_code: worktree_char.to_string(),
                        });
                    }
                }
            }
        }

        let mut files = Vec::new();
        files.extend(staged.clone());
        files.extend(unstaged.clone());
        files.extend(untracked.clone());

        let is_clean = staged.is_empty() && unstaged.is_empty() && untracked.is_empty();

        Ok(GitStatus {
            is_repo: true,
            is_git_repo: true,
            branch: branch.clone(),
            current_branch: branch,
            ahead,
            behind,
            staged,
            unstaged,
            untracked,
            is_clean,
            files,
        })
    }

    /// Récupère le diff unifié complet ou pour un fichier ciblé
    pub fn get_diff(ws_root: &Path, file_path: Option<&str>, staged: bool) -> Result<String, String> {
        if !Self::is_git_repo(ws_root) {
            return Err("Le dossier n'est pas un dépôt Git".to_string());
        }

        let mut cmd = Self::git_cmd(ws_root);
        cmd.arg("diff");

        if staged {
            cmd.arg("--cached");
        } else {
            cmd.arg("HEAD");
        }

        if let Some(p) = file_path {
            if !p.trim().is_empty() {
                cmd.arg("--").arg(p);
            }
        }

        let output = cmd
            .output()
            .map_err(|e| format!("Erreur git diff : {}", e))?;

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Récupère l'historique des commits
    pub fn get_log(ws_root: &Path, limit: usize) -> Result<Vec<GitCommitInfo>, String> {
        if !Self::is_git_repo(ws_root) {
            return Ok(Vec::new());
        }

        let max_n = format!("-n{}", limit.max(1));
        let output = Self::git_cmd(ws_root)
            .args(&["log", &max_n, "--pretty=format:%H|%h|%an|%ad|%s", "--date=short"])
            .output()
            .map_err(|e| format!("Erreur git log : {}", e))?;

        if !output.status.success() {
            return Ok(Vec::new()); // Peut-être un dépôt neuf sans commits
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut commits = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 5 {
                commits.push(GitCommitInfo {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    author: parts[2].to_string(),
                    date: parts[3].to_string(),
                    message: parts[4..].join("|"),
                });
            }
        }

        Ok(commits)
    }

    /// Récupère la liste des branches locales et distantes
    pub fn get_branches(ws_root: &Path) -> Result<Vec<GitBranchInfo>, String> {
        if !Self::is_git_repo(ws_root) {
            return Ok(Vec::new());
        }

        let output = Self::git_cmd(ws_root)
            .args(&["branch", "-a"])
            .output()
            .map_err(|e| format!("Erreur git branch : {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut branches = Vec::new();

        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let is_current = line.starts_with('*');
            let raw_name = trimmed.trim_start_matches('*').trim();
            let is_remote = raw_name.starts_with("remotes/");

            branches.push(GitBranchInfo {
                name: raw_name.to_string(),
                is_current,
                is_remote,
            });
        }

        Ok(branches)
    }

    /// Ajoute un fichier à l'index (Stage)
    pub fn stage_file(ws_root: &Path, rel_path: &str) -> Result<(), String> {
        let output = Self::git_cmd(ws_root)
            .args(&["add", "--", rel_path])
            .output()
            .map_err(|e| format!("Erreur git add : {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }

    /// Retire un fichier de l'index (Unstage)
    pub fn unstage_file(ws_root: &Path, rel_path: &str) -> Result<(), String> {
        let output = Self::git_cmd(ws_root)
            .args(&["restore", "--staged", "--", rel_path])
            .output()
            .map_err(|e| format!("Erreur git restore --staged : {}", e))?;

        if !output.status.success() {
            // Repli git reset HEAD pour compatibilité avec d'anciennes versions
            let _ = Self::git_cmd(ws_root)
                .args(&["reset", "HEAD", "--", rel_path])
                .output();
        }
        Ok(())
    }

    /// Effectue un commit Git
    pub fn commit(ws_root: &Path, message: &str) -> Result<String, String> {
        if message.trim().is_empty() {
            return Err("Le message de commit ne peut pas être vide".to_string());
        }

        let output = Self::git_cmd(ws_root)
            .args(&["commit", "-m", message])
            .output()
            .map_err(|e| format!("Erreur git commit : {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Change de branche Git (Checkout / Switch)
    pub fn checkout_branch(ws_root: &Path, branch: &str) -> Result<(), String> {
        let output = Self::git_cmd(ws_root)
            .args(&["checkout", branch])
            .output()
            .map_err(|e| format!("Erreur git checkout : {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }

    /// Crée une nouvelle branche et bascule dessus
    pub fn create_branch(ws_root: &Path, branch_name: &str) -> Result<(), String> {
        let output = Self::git_cmd(ws_root)
            .args(&["checkout", "-b", branch_name])
            .output()
            .map_err(|e| format!("Erreur git checkout -b : {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }

    /// Récupère le contenu d'un fichier à une révision Git spécifique (par défaut HEAD)
    pub fn get_file_content_at_revision(
        workspace: &Path,
        rel_path: &str,
        revision: Option<&str>,
    ) -> Result<String, String> {
        if !Self::is_git_repo(workspace) {
            return Err("Le dossier n'est pas un dépôt Git".to_string());
        }

        let rev = revision.unwrap_or("HEAD");
        let clean_path = rel_path.trim_start_matches("./").trim_start_matches('/');
        let target = format!("{}:{}", rev, clean_path);

        let output = Self::git_cmd(workspace)
            .args(&["show", &target])
            .output()
            .map_err(|e| format!("Erreur exécution git show : {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Si le fichier n'existe pas dans cette révision (ex: nouveau fichier non indexé)
            if stderr.contains("does not exist")
                || stderr.contains("existe sur le disque, mais pas")
                || stderr.contains("fatal: Path")
                || stderr.contains("fatal: path")
            {
                return Ok(String::new());
            }
            return Err(format!("Git error: {}", stderr.trim()));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}
