use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub timestamp: DateTime<Utc>,
    pub actor: String,          // "agent" | "user" | "security_sandbox"
    pub action_type: String,    // "file_write" | "file_read" | "command_exec" | "tool_call" | "checkpoint_restore"
    pub target: String,         // Chemin ou commande
    pub status: String,         // "success" | "blocked" | "error"
    pub details: Option<serde_json::Value>,
}

pub struct AuditLogger;

impl AuditLogger {
    fn log_path(workspace_root: &Path) -> PathBuf {
        workspace_root.join(".local_agent").join("audit.jsonl")
    }

    /// Enregistre une entrée immuable dans le journal d'audit
    pub fn log(
        workspace_root: &Path,
        actor: &str,
        action_type: &str,
        target: &str,
        status: &str,
        details: Option<serde_json::Value>,
    ) {
        let entry = AuditEntry {
            timestamp: Utc::now(),
            actor: actor.to_string(),
            action_type: action_type.to_string(),
            target: target.to_string(),
            status: status.to_string(),
            details,
        };

        let path = Self::log_path(workspace_root);
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        if let Ok(line) = serde_json::to_string(&entry) {
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
                let _ = writeln!(file, "{}", line);
            }
        }
    }

    /// Lit les dernières entrées du journal d'audit
    pub fn read_recent(workspace_root: &Path, limit: usize) -> Vec<AuditEntry> {
        let path = Self::log_path(workspace_root);
        if !path.exists() {
            return Vec::new();
        }

        let mut entries = Vec::new();
        if let Ok(content) = fs::read_to_string(path) {
            for line in content.lines().rev() {
                if let Ok(entry) = serde_json::from_str::<AuditEntry>(line) {
                    entries.push(entry);
                    if entries.len() >= limit {
                        break;
                    }
                }
            }
        }
        entries
    }
}
