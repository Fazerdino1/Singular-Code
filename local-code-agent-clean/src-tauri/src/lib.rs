pub mod agent;
pub mod checkpoints;
pub mod git;
pub mod projects;
pub mod security;
pub mod tools;

use std::path::PathBuf;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use agent::{AgentEngine, AgentStepEvent, ApprovalMode, ChatMessage, LearningItem, ModelProfile, TokenUsageMetrics};
use checkpoints::{Checkpoint, CheckpointManager};
use security::{CommandOutput, SandboxConfig};
use tools::{FileEntry, HybridSearchResult, SearchResult, SymbolItem, ToolRegistry};

pub struct AppState {
    pub workspace_root: Mutex<Option<PathBuf>>,
    pub sandbox_config: Mutex<SandboxConfig>,
    pub current_agent: Arc<Mutex<Option<Arc<AgentEngine>>>>,
}

impl AppState {
    pub async fn get_workspace(&self) -> Result<PathBuf, String> {
        let guard = self.workspace_root.lock().await;
        guard.clone().ok_or_else(|| "Aucun workspace ouvert".to_string())
    }

    pub async fn get_sandbox_config(&self) -> SandboxConfig {
        self.sandbox_config.lock().await.clone()
    }
}

pub struct AgentGuard {
    pub current_agent: Arc<Mutex<Option<Arc<AgentEngine>>>>,
}

impl Drop for AgentGuard {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.current_agent.try_lock() {
            *guard = None;
        } else {
            let slot = self.current_agent.clone();
            tokio::spawn(async move {
                let mut guard = slot.lock().await;
                *guard = None;
            });
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct SystemStatus {
    pub bwrap_available: bool,
    pub docker_available: bool,
    pub os_name: String,
    pub current_workspace: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct DiffResult {
    pub original: String,
    pub modified: String,
    pub has_changes: bool,
}

// -------------------------------------------------------------
// COMMANDES TAURI IPC
// -------------------------------------------------------------

#[tauri::command]
async fn select_workspace_folder(app: AppHandle) -> Result<Option<String>, String> {
    // 1. Essayer avec zenity d'abord sur Linux pour une réactivité instantanée
    if let Ok(output) = std::process::Command::new("zenity")
        .args(&["--file-selection", "--directory", "--title=Sélectionner le dossier du workspace"])
        .output()
    {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                return Ok(Some(path_str));
            }
        }
    }

    // 2. Repli tauri-plugin-dialog
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder.map(|p| p.to_string()));
    });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_workspace_dir(
    rel_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.create_dir(&rel_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_system_status(state: State<'_, AppState>) -> Result<SystemStatus, String> {
    let ws_str = state.get_workspace().await.ok().map(|p| p.to_string_lossy().to_string());

    Ok(SystemStatus {
        bwrap_available: security::SandboxManager::is_bwrap_available(),
        docker_available: security::SandboxManager::is_docker_available(),
        os_name: "Linux (Nobara/Fedora)".to_string(),
        current_workspace: ws_str,
    })
}

#[tauri::command]
async fn open_workspace(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Le dossier spécifié n'existe pas : {}", path));
    }

    let canonical = std::fs::canonicalize(&p).map_err(|e| e.to_string())?;
    let mut ws = state.workspace_root.lock().await;
    *ws = Some(canonical.clone());

    Ok(canonical.to_string_lossy().to_string())
}

#[tauri::command]
async fn list_workspace_files(
    state: State<'_, AppState>,
) -> Result<Vec<FileEntry>, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.list_dir(None, true, Some(6)).map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_workspace_file(
    rel_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.read_file(&rel_path, None, None).map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_workspace_file(
    rel_path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.write_file(&rel_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_workspace_file(
    rel_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.delete_file(&rel_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn rename_workspace_file(
    old_path: String,
    new_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.move_file(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_file_diff(
    rel_path: String,
    new_content: String,
    state: State<'_, AppState>,
) -> Result<DiffResult, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    let original = registry.read_file(&rel_path, None, None).unwrap_or_default();
    let has_changes = original != new_content;

    Ok(DiffResult {
        original,
        modified: new_content,
        has_changes,
    })
}

#[tauri::command]
async fn execute_sandbox_command(
    command: String,
    state: State<'_, AppState>,
) -> Result<CommandOutput, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.run_command(&command).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_libreoffice_doc(
    source_path: String,
    target_format: String,
    outdir: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    let res = registry
        .export_libreoffice_doc(&source_path, &target_format, outdir.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(res.to_string())
}

#[tauri::command]
async fn generate_libreoffice_template(
    app_type: String,
    path: String,
    title: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    let res = registry
        .generate_libreoffice_template(&app_type, &path, &title, &content)
        .await
        .map_err(|e| e.to_string())?;
    Ok(res.to_string())
}

#[tauri::command]
async fn read_libreoffice_doc(
    path: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry
        .read_libreoffice_doc(&path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_checkpoints(state: State<'_, AppState>) -> Result<Vec<Checkpoint>, String> {
    let ws = state.get_workspace().await?;
    let cp_mgr = CheckpointManager::new(&ws).map_err(|e| e.to_string())?;
    cp_mgr.list_checkpoints().map_err(|e| e.to_string())
}

#[tauri::command]
async fn restore_checkpoint(checkpoint_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    let cp_mgr = CheckpointManager::new(&ws).map_err(|e| e.to_string())?;
    cp_mgr.restore_checkpoint(&checkpoint_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn rollback_transaction(checkpoint_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    let cp_mgr = CheckpointManager::new(&ws).map_err(|e| e.to_string())?;
    cp_mgr.restore_checkpoint(&checkpoint_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_workspace_symbols(state: State<'_, AppState>) -> Result<Vec<SymbolItem>, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;
    registry.get_workspace_symbols().map_err(|e| e.to_string())
}

#[tauri::command]
async fn hybrid_search_workspace(
    query: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<HybridSearchResult>, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;
    registry.hybrid_search(&query, limit).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_project_learnings(state: State<'_, AppState>) -> Result<Vec<LearningItem>, String> {
    let ws = state.get_workspace().await?;
    Ok(AgentEngine::load_learnings(&ws))
}

#[tauri::command]
async fn save_project_learning(
    category: String,
    title: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<LearningItem, String> {
    let ws = state.get_workspace().await?;
    let item = LearningItem {
        id: uuid::Uuid::new_v4().to_string(),
        category,
        title,
        content,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    AgentEngine::save_learning_to_file(&ws, item.clone())?;
    Ok(item)
}

#[tauri::command]
async fn delete_project_learning(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    AgentEngine::delete_learning_from_file(&ws, &id)
}

#[tauri::command]
async fn run_test_suite_and_auto_repair(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;
    registry.run_test_suite().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_model_connection(profile: ModelProfile) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let url = if profile.api_url.ends_with("/v1") {
        format!("{}/models", profile.api_url)
    } else {
        format!("{}/v1/models", profile.api_url.trim_end_matches('/'))
    };

    let mut req = client.get(&url);
    if let Some(key) = &profile.api_key {
        if !key.trim().is_empty() {
            req = req.bearer_auth(key);
        }
    }

    let resp = req.send().await.map_err(|e| format!("Impossible de joindre le modèle sur {} : {}", url, e))?;

    if !resp.status().is_success() {
        return Err(format!("Le serveur a répondu avec le statut : {}", resp.status()));
    }

    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut model_names = Vec::new();

    if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
        for m in data {
            if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                model_names.push(id.to_string());
            }
        }
    }

    Ok(model_names)
}

#[tauri::command]
async fn abort_agent(state: State<'_, AppState>) -> Result<(), String> {
    let agent_guard = state.current_agent.lock().await;
    if let Some(agent) = agent_guard.as_ref() {
        agent.abort().await;
    }
    Ok(())
}

#[tauri::command]
async fn set_network_access(allow: bool, state: State<'_, AppState>) -> Result<(), String> {
    let mut cfg = state.sandbox_config.lock().await;
    cfg.allow_network = allow;
    Ok(())
}

#[tauri::command]
async fn web_search(
    query: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.web_search(&query, limit).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_url(
    url: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.fetch_url(&url).await.map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HardwareMetrics {
    pub gpu_name: String,
    pub vram_total_mb: u64,
    pub vram_used_mb: u64,
    pub gpu_utilization_pct: u32,
    pub ram_total_mb: u64,
    pub ram_used_mb: u64,
}

#[tauri::command]
async fn get_hardware_metrics() -> Result<HardwareMetrics, String> {
    // 1. GPU via nvidia-smi asynchrone (Non-bloquant pour le runtime Tokio avec timeout 2s)
    let (gpu_name, vram_total_mb, vram_used_mb, gpu_utilization_pct) = {
        let cmd = tokio::process::Command::new("nvidia-smi")
            .args(&["--query-gpu=name,memory.total,memory.used,utilization.gpu", "--format=csv,noheader,nounits"])
            .output();

        let output_res = tokio::time::timeout(std::time::Duration::from_secs(2), cmd).await;

        if let Ok(Ok(output)) = output_res {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let lines: Vec<&str> = stdout.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
                if !lines.is_empty() {
                    let mut names = Vec::new();
                    let mut vram_total = 0u64;
                    let mut vram_used = 0u64;
                    let mut max_util = 0u32;
                    for line in &lines {
                        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
                        if parts.len() >= 4 {
                            names.push(parts[0].to_string());
                            vram_total += parts[1].parse::<u64>().unwrap_or(0);
                            vram_used += parts[2].parse::<u64>().unwrap_or(0);
                            let util = parts[3].parse::<u32>().unwrap_or(0);
                            if util > max_util {
                                max_util = util;
                            }
                        }
                    }
                    if !names.is_empty() {
                        let combined_name = if names.len() == 1 {
                            names[0].clone()
                        } else {
                            format!("{} (x{})", names[0], names.len())
                        };
                        (combined_name, vram_total, vram_used, max_util)
                    } else {
                        ("GPU".to_string(), 0, 0, 0)
                    }
                } else {
                    ("GPU standard / iGPU".to_string(), 0, 0, 0)
                }
            } else {
                ("GPU standard / iGPU".to_string(), 0, 0, 0)
            }
        } else {
            ("Non NVIDIA".to_string(), 0, 0, 0)
        }
    };

    // 2. RAM via /proc/meminfo asynchrone
    let mut ram_total_kb = 0u64;
    let mut ram_avail_kb = 0u64;
    if let Ok(meminfo) = tokio::fs::read_to_string("/proc/meminfo").await {
        for line in meminfo.lines() {
            if line.starts_with("MemTotal:") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    ram_total_kb = parts[1].parse::<u64>().unwrap_or(0);
                }
            } else if line.starts_with("MemAvailable:") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    ram_avail_kb = parts[1].parse::<u64>().unwrap_or(0);
                }
            }
        }
    }

    let ram_total_mb = ram_total_kb / 1024;
    let ram_used_mb = (ram_total_kb.saturating_sub(ram_avail_kb)) / 1024;

    Ok(HardwareMetrics {
        gpu_name,
        vram_total_mb,
        vram_used_mb,
        gpu_utilization_pct,
        ram_total_mb,
        ram_used_mb,
    })
}

#[tauri::command]
async fn get_hardware_status() -> Result<HardwareMetrics, String> {
    get_hardware_metrics().await
}

#[tauri::command]
async fn unload_local_models() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Lister les modèles actuellement chargés dans la mémoire VRAM d'Ollama
    let ps_resp = match client.get("http://localhost:11434/api/ps").send().await {
        Ok(r) => r,
        Err(e) => return Ok(format!("Ollama non détecté sur le port 11434 ({})", e)),
    };

    if !ps_resp.status().is_success() {
        return Ok("Ollama indisponible pour déchargement".to_string());
    }

    let ps_json: serde_json::Value = ps_resp.json().await.unwrap_or(serde_json::json!({}));
    let mut unloaded_count = 0;
    if let Some(models) = ps_json.get("models").and_then(|m| m.as_array()) {
        for m in models {
            if let Some(name) = m.get("name").and_then(|n| n.as_str()) {
                // Décharger immédiatement de la VRAM avec keep_alive: 0
                if let Ok(res) = client
                    .post("http://localhost:11434/api/generate")
                    .json(&serde_json::json!({ "model": name, "keep_alive": 0 }))
                    .send()
                    .await
                {
                    if res.status().is_success() {
                        unloaded_count += 1;
                    }
                }
            }
        }
    }

    if unloaded_count > 0 {
        Ok(format!("{} modèle(s) déchargé(s) de la VRAM. 100% de la mémoire GPU libérée.", unloaded_count))
    } else {
        Ok("Aucun modèle actif en VRAM à décharger.".to_string())
    }
}

#[tauri::command]
async fn grep_workspace_files(
    query: String,
    case_sensitive: bool,
    state: State<'_, AppState>,
) -> Result<Vec<tools::GrepMatch>, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;

    registry.grep_files(&query, None, case_sensitive).map_err(|e| e.to_string())
}

#[tauri::command]
async fn send_system_notification(title: String, message: String) -> Result<(), String> {
    let _ = std::process::Command::new("notify-send")
        .args(&["-i", "dialog-information", &title, &message])
        .spawn();
    Ok(())
}

#[tauri::command]
async fn restore_file_checkpoint(
    checkpoint_id: String,
    rel_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    let checkpoints = CheckpointManager::new(&ws).map_err(|e| e.to_string())?;
    checkpoints.restore_file_from_checkpoint(&checkpoint_id, &rel_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_audit_logs(
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<security::audit_log::AuditEntry>, String> {
    let ws = state.get_workspace().await?;
    Ok(security::audit_log::AuditLogger::read_recent(&ws, limit.unwrap_or(100)))
}

// -------------------------------------------------------------
// COMMANDES GIT SOURCE CONTROL (Compatibilité Git Complète)
// -------------------------------------------------------------

#[tauri::command]
async fn get_git_status(state: State<'_, AppState>) -> Result<git::GitStatus, String> {
    let ws = state.get_workspace().await?;
    git::GitManager::get_status(&ws)
}

#[tauri::command]
async fn get_git_diff(
    path: Option<String>,
    staged: Option<bool>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ws = state.get_workspace().await?;
    git::GitManager::get_diff(&ws, path.as_deref(), staged.unwrap_or(false))
}

#[tauri::command]
async fn get_git_log(
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<git::GitCommitInfo>, String> {
    let ws = state.get_workspace().await?;
    git::GitManager::get_log(&ws, limit.unwrap_or(30))
}

#[tauri::command]
async fn get_git_branches(state: State<'_, AppState>) -> Result<Vec<git::GitBranchInfo>, String> {
    let ws = state.get_workspace().await?;
    git::GitManager::get_branches(&ws)
}

#[tauri::command]
async fn git_stage_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    git::GitManager::stage_file(&ws, &path)
}

#[tauri::command]
async fn git_unstage_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    git::GitManager::unstage_file(&ws, &path)
}

#[tauri::command]
async fn git_commit(message: String, state: State<'_, AppState>) -> Result<String, String> {
    let ws = state.get_workspace().await?;
    git::GitManager::commit(&ws, &message)
}

#[tauri::command]
async fn git_checkout_branch(branch: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    git::GitManager::checkout_branch(&ws, &branch)
}

#[tauri::command]
async fn git_create_branch(branch: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws = state.get_workspace().await?;
    git::GitManager::create_branch(&ws, &branch)
}

#[tauri::command]
async fn get_git_file_content(
    path: String,
    revision: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ws = state.get_workspace().await?;
    git::GitManager::get_file_content_at_revision(&ws, &path, revision.as_deref())
}

#[tauri::command]
async fn get_git_show(
    path: String,
    revision: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ws = state.get_workspace().await?;
    git::GitManager::get_file_content_at_revision(&ws, &path, revision.as_deref())
}

// -------------------------------------------------------------
// COMMANDES DE SÉCURITÉ & DIAGNOSTICS AVANCÉS
// -------------------------------------------------------------

#[tauri::command]
async fn check_landlock_status() -> Result<security::LandlockStatus, String> {
    Ok(security::LinuxSecurityEnhancements::check_landlock_support())
}

#[tauri::command]
async fn inspect_binary_file(
    rel_path: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;
    registry.inspect_binary(&rel_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn profile_benchmark_command(
    command: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;
    registry.profile_benchmark(&command).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn analyze_local_image_file(
    rel_path: String,
    prompt: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let ws = state.get_workspace().await?;
    let cfg = state.get_sandbox_config().await;
    let registry = ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?;
    registry.analyze_local_image(&rel_path, prompt.as_deref()).await.map_err(|e| e.to_string())
}

// -------------------------------------------------------------
// COMMANDES DE GESTION DES PROJETS (Multi-Dossiers & Règles)
// -------------------------------------------------------------

#[tauri::command]
async fn get_projects(state: State<'_, AppState>) -> Result<Vec<projects::ProjectConfig>, String> {
    let ws_opt = state.get_workspace().await.ok();
    projects::ProjectsManager::list_projects(ws_opt.as_deref())
}

#[tauri::command]
async fn save_project(project: projects::ProjectConfig, state: State<'_, AppState>) -> Result<(), String> {
    let ws_opt = state.get_workspace().await.ok();
    projects::ProjectsManager::save_project(project, ws_opt.as_deref())
}

#[tauri::command]
async fn delete_project(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws_opt = state.get_workspace().await.ok();
    projects::ProjectsManager::delete_project(&id, ws_opt.as_deref())
}

#[tauri::command]
async fn get_project_rules(id: String, state: State<'_, AppState>) -> Result<String, String> {
    let ws_opt = state.get_workspace().await.ok();
    projects::ProjectsManager::get_project_rules(&id, ws_opt.as_deref())
}

#[tauri::command]
async fn set_project_rules(id: String, rules: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws_opt = state.get_workspace().await.ok();
    projects::ProjectsManager::set_project_rules(&id, &rules, ws_opt.as_deref())
}

#[tauri::command]
async fn add_folder_to_project(id: String, folder_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws_opt = state.get_workspace().await.ok();
    projects::ProjectsManager::add_folder_to_project(&id, &folder_path, ws_opt.as_deref())
}

#[tauri::command]
async fn remove_folder_from_project(id: String, folder_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let ws_opt = state.get_workspace().await.ok();
    projects::ProjectsManager::remove_folder_from_project(&id, &folder_path, ws_opt.as_deref())
}

#[derive(Serialize, Deserialize)]
pub struct SqliteColumnDesc {
    pub cid: i32,
    pub name: String,
    pub r#type: String,
    pub notnull: bool,
    pub pk: bool,
}

#[derive(Serialize, Deserialize)]
pub struct SqliteTableDesc {
    pub table: String,
    pub columns: Vec<SqliteColumnDesc>,
    pub row_count: usize,
}

#[derive(Serialize, Deserialize)]
pub struct SqliteQueryOutput {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub duration_ms: u64,
    pub error: Option<String>,
}

#[tauri::command]
async fn inspect_sqlite_database(
    db_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<SqliteTableDesc>, String> {
    let ws_opt = state.get_workspace().await.ok();
    let full_path = if let Some(ws) = ws_opt.as_ref() {
        let p = std::path::Path::new(&db_path);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            ws.join(p)
        }
    } else {
        std::path::PathBuf::from(&db_path)
    };

    if !full_path.exists() {
        return Err(format!("Le fichier de base de données n'existe pas : {:?}", full_path));
    }

    let script = r#"
import sqlite3, json, sys
try:
    conn = sqlite3.connect(sys.argv[1])
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    tables = [row[0] for row in c.fetchall()]
    res = []
    for t in tables:
        c.execute(f"PRAGMA table_info('{t}')")
        cols = [{'cid': r[0], 'name': r[1], 'type': r[2], 'notnull': bool(r[3]), 'pk': bool(r[5])} for r in c.fetchall()]
        try:
            c.execute(f"SELECT count(*) FROM '{t}'")
            cnt = c.fetchone()[0]
        except Exception:
            cnt = 0
        res.append({'table': t, 'columns': cols, 'row_count': cnt})
    print(json.dumps(res))
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
"#;

    let output = std::process::Command::new("python3")
        .args(&["-c", script, &full_path.to_string_lossy()])
        .output()
        .map_err(|e| format!("Impossible de lancer python3 : {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    serde_json::from_slice(&output.stdout).map_err(|e| format!("Erreur décodage JSON SQLite : {}", e))
}

#[tauri::command]
async fn query_sqlite_database(
    db_path: String,
    sql: String,
    state: State<'_, AppState>,
) -> Result<SqliteQueryOutput, String> {
    let ws_opt = state.get_workspace().await.ok();
    let full_path = if let Some(ws) = ws_opt.as_ref() {
        let p = std::path::Path::new(&db_path);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            ws.join(p)
        }
    } else {
        std::path::PathBuf::from(&db_path)
    };

    if !full_path.exists() {
        return Err(format!("Fichier introuvable : {:?}", full_path));
    }

    let start = std::time::Instant::now();
    let script = r#"
import sqlite3, json, sys

db = sys.argv[1]
query = sys.argv[2]

def default_serializer(obj):
    if isinstance(obj, (bytes, bytearray, memoryview)):
        return f"0x{bytes(obj).hex()}"
    return str(obj)

try:
    try:
        conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    except Exception:
        conn = sqlite3.connect(db)
    try:
        conn.execute("PRAGMA query_only = ON;")
    except Exception:
        pass

    c = conn.cursor()
    c.execute(query)
    cols = [d[0] for d in c.description] if c.description else []
    rows = []
    if c.description:
        raw_rows = c.fetchmany(500)
        for r in raw_rows:
            processed_row = []
            for val in r:
                if isinstance(val, (bytes, bytearray, memoryview)):
                    processed_row.append(f"0x{bytes(val).hex()}")
                else:
                    processed_row.append(val)
            rows.append(processed_row)
    print(json.dumps({'columns': cols, 'rows': rows, 'row_count': len(rows), 'error': None}, default=default_serializer))
except Exception as e:
    print(json.dumps({'columns': [], 'rows': [], 'row_count': 0, 'error': str(e)}))
"#;

    let output = std::process::Command::new("python3")
        .args(&["-c", script, &full_path.to_string_lossy(), &sql])
        .output()
        .map_err(|e| format!("Échec python3: {}", e))?;

    let duration_ms = start.elapsed().as_millis() as u64;

    #[derive(Deserialize)]
    struct RawResult {
        columns: Vec<String>,
        rows: Vec<Vec<serde_json::Value>>,
        row_count: usize,
        error: Option<String>,
    }

    if let Ok(raw) = serde_json::from_slice::<RawResult>(&output.stdout) {
        Ok(SqliteQueryOutput {
            columns: raw.columns,
            rows: raw.rows,
            row_count: raw.row_count,
            duration_ms,
            error: raw.error,
        })
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Tronque sagement une chaîne volumineuse en préservant le début (contexte) ET la fin (erreurs/synthèses) sans couper de caractère UTF-8
fn truncate_tool_output(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        return s.to_string();
    }
    let half = (max_len.saturating_sub(120)) / 2;
    let head_end = s
        .char_indices()
        .map(|(idx, _)| idx)
        .take_while(|&idx| idx <= half)
        .last()
        .unwrap_or(0);
    let tail_target = s.len().saturating_sub(half);
    let tail_start = s
        .char_indices()
        .map(|(idx, _)| idx)
        .find(|&idx| idx >= tail_target)
        .unwrap_or(s.len());

    let head = &s[..head_end];
    let tail = &s[tail_start..];
    format!(
        "{}\n\n[... {} caractères omis pour préserver le contexte ...]\n\n{}",
        head,
        tail_start.saturating_sub(head_end),
        tail
    )
}

/// Détermine si un outil est en lecture seule (éligible à l'exécution simultanée/parallèle)
fn is_read_only_tool(name: &str) -> bool {
    let lower = name.to_lowercase();
    matches!(
        lower.as_str(),
        "read_file" | "read" | "cat" | "view" | "view_file" | "open_file" | "load_file"
        | "list_dir" | "list" | "ls" | "dir" | "list_directory" | "listdir" | "list_files"
        | "glob_files" | "glob" | "find" | "find_files" | "file_search"
        | "grep_files" | "grep" | "search_files" | "ripgrep" | "rg" | "text_search"
        | "search_semantic" | "ast_grep" | "hybrid_search"
        | "calculate_code_metrics" | "inspect_binary" | "check_http_service"
        | "fetch_url" | "web_search"
    )
}

#[tauri::command]
async fn run_agent_loop(
    prompt: String,
    profile: ModelProfile,
    approval_mode: ApprovalMode,
    history: Option<Vec<ChatMessage>>,
    project_rules: Option<String>,
    project_folders: Option<Vec<String>>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ws = {
        let mut ws_guard = state.workspace_root.lock().await;
        if ws_guard.is_none() {
            let cur = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            *ws_guard = Some(cur);
        }
        ws_guard.as_ref().unwrap().clone()
    };

    let cfg = state.sandbox_config.lock().await.clone();
    let tools = Arc::new(ToolRegistry::new(&ws, cfg).map_err(|e| e.to_string())?);
    let checkpoints = Arc::new(CheckpointManager::new(&ws).map_err(|e| e.to_string())?);

    // Initialisation d'une transaction multi-fichiers atomique pour ce tour (Item 2)
    let transaction_cp = checkpoints.create_checkpoint(&format!("Transaction: {}", prompt.chars().take(40).collect::<String>())).ok();
    let transaction_id = transaction_cp.as_ref().map(|cp| cp.id.clone());
    let mut modified_files: Vec<String> = Vec::new();

    let engine = Arc::new(AgentEngine::new(profile.clone(), approval_mode));
    {
        let mut cur = state.current_agent.lock().await;
        if cur.is_some() {
            return Err("Un agent est déjà en cours d'exécution.".to_string());
        }
        *cur = Some(engine.clone());
    }
    let _agent_guard = AgentGuard {
        current_agent: state.current_agent.clone(),
    };

    let system_prompt = engine.build_system_prompt(
        &tools,
        project_rules.as_deref(),
        project_folders.as_deref(),
    );

    // Initialisation des messages avec historique conversationnel multi-tours
    let mut messages: Vec<Value> = vec![
        json!({ "role": "system", "content": system_prompt }),
    ];

    if let Some(hist) = history {
        for msg in hist {
            let (_thought_opt, mut clean_content) = AgentEngine::extract_and_strip_think_tags(&msg.content);
            if clean_content.len() > 3000 {
                clean_content = format!("{}... [tronqué]", AgentEngine::safe_truncate_str(&clean_content, 2500));
            }
            if !clean_content.is_empty() {
                messages.push(json!({
                    "role": msg.role,
                    "content": clean_content
                }));
            }
        }
    }

    messages.push(json!({ "role": "user", "content": prompt }));

    let mut iteration = 0;
    let max_iter = engine.max_iterations;
    let mut tool_history: Vec<(String, String)> = Vec::new();
    let mut last_executed_tool: Option<String> = None;
    let mut current_num_ctx = profile.num_ctx.unwrap_or(16384).max(8192);
    let mut current_max_tokens = profile.max_tokens.max(4096);
    let max_allowed_ctx = 131072;

    let _ = app.emit("agent:event", AgentStepEvent {
        step_type: "thought".to_string(),
        content: format!("Démarrage de la tâche (Contexte alloué : {} tokens, Max tokens : {}) : {}", current_num_ctx, current_max_tokens, prompt),
        tool_name: None,
        tool_args: None,
        tool_result: None,
        tool_id: None,
        token_usage: Some(TokenUsageMetrics {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            current_num_ctx,
            max_tokens: current_max_tokens,
            auto_expanded: false,
        }),
    });

    // Pool HTTP persistant réutilisé avec Keep-Alive (Pack Optimisation Backend)
    let persistent_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .tcp_nodelay(true)
        .build()
        .unwrap_or_default();

    while iteration < max_iter {
        // Vérifier si l'utilisateur a annulé
        if *engine.is_aborted.lock().await {
            let _ = app.emit("agent:event", AgentStepEvent {
                step_type: "done".to_string(),
                content: "Tâche interrompue par l'utilisateur.".to_string(),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                tool_id: None,
                token_usage: None,
            });
            break;
        }

        iteration += 1;

        // Appel à l'API OpenAI / Ollama compatible
        let endpoint = if profile.api_url.ends_with("/v1") {
            format!("{}/chat/completions", profile.api_url)
        } else {
            format!("{}/v1/chat/completions", profile.api_url.trim_end_matches('/'))
        };

        let tools_defs = AgentEngine::get_tools_definitions();

        let req_body = if profile.supports_native_tools {
            json!({
                "model": profile.model_id,
                "messages": messages,
                "temperature": profile.temperature,
                "top_p": 0.9,
                "max_tokens": current_max_tokens,
                "keep_alive": "15m",
                "options": {
                    "num_ctx": current_num_ctx,
                    "temperature": profile.temperature,
                    "top_p": 0.9,
                    "repeat_penalty": 1.05,
                    "num_batch": 512,
                    "num_predict": current_max_tokens,
                    "keep_alive": "15m"
                },
                "tools": tools_defs,
                "tool_choice": "auto"
            })
        } else {
            json!({
                "model": profile.model_id,
                "messages": messages,
                "temperature": profile.temperature,
                "top_p": 0.9,
                "max_tokens": current_max_tokens,
                "keep_alive": "15m",
                "options": {
                    "num_ctx": current_num_ctx,
                    "temperature": profile.temperature,
                    "top_p": 0.9,
                    "repeat_penalty": 1.05,
                    "num_batch": 512,
                    "num_predict": current_max_tokens,
                    "keep_alive": "15m"
                }
            })
        };

        let mut req = persistent_client.post(&endpoint).json(&req_body);
        if let Some(key) = &profile.api_key {
            if !key.trim().is_empty() {
                req = req.bearer_auth(key);
            }
        }

        let resp = {
            let send_fut = req.send();
            tokio::pin!(send_fut);
            let mut cancelled = false;

            let result = loop {
                tokio::select! {
                    r = &mut send_fut => {
                        break Some(r);
                    }
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(150)) => {
                        if *engine.is_aborted.lock().await {
                            cancelled = true;
                            break None;
                        }
                    }
                }
            };

            if cancelled {
                let _ = app.emit("agent:event", AgentStepEvent {
                    step_type: "done".to_string(),
                    content: "Tâche interrompue par l'utilisateur.".to_string(),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    tool_id: None,
                    token_usage: None,
                });
                break;
            }

            match result.unwrap() {
                Ok(r) => r,
                Err(e) => {
                    let err_msg = format!("Erreur réseau lors de la communication avec le LLM : {}", e);
                    let _ = app.emit("agent:event", AgentStepEvent {
                        step_type: "error".to_string(),
                        content: err_msg.clone(),
                        tool_name: None,
                        tool_args: None,
                        tool_result: None,
                        tool_id: None,
                        token_usage: None,
                    });
                    return Err(err_msg);
                }
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let body_text = resp.text().await.unwrap_or_default();
            let err_msg = format!("Erreur HTTP du LLM ({}) : {}", status, body_text);
            let _ = app.emit("agent:event", AgentStepEvent {
                step_type: "error".to_string(),
                content: err_msg.clone(),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                tool_id: None,
                token_usage: None,
            });
            return Err(err_msg);
        }

        let resp_json: Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                let err_msg = format!("Réponse JSON invalide du modèle : {}", e);
                let _ = app.emit("agent:event", AgentStepEvent {
                    step_type: "error".to_string(),
                    content: err_msg.clone(),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    tool_id: None,
                    token_usage: None,
                });
                return Err(err_msg);
            }
        };

        let choice = resp_json
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .or_else(|| resp_json.get("message"));

        let assistant_msg = match choice {
            Some(m) => m,
            None => {
                let err_msg = if let Some(err) = resp_json.get("error") {
                    format!("Erreur retournée par le LLM : {}", err)
                } else {
                    format!("Format de réponse du LLM inattendu (pas de message exploitable) : {}", resp_json)
                };
                let _ = app.emit("agent:event", AgentStepEvent {
                    step_type: "error".to_string(),
                    content: err_msg.clone(),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    tool_id: None,
                    token_usage: None,
                });
                return Err(err_msg);
            }
        };

        let raw_content = assistant_msg
            .get("content")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();

        // 1. Extraction et calcul des tokens réels ou estimés
        let prompt_tokens = resp_json.get("usage")
            .and_then(|u| u.get("prompt_tokens"))
            .and_then(|v| v.as_u64())
            .or_else(|| resp_json.get("prompt_eval_count").and_then(|v| v.as_u64()))
            .map(|v| v as usize)
            .unwrap_or_else(|| {
                let chars: usize = messages.iter()
                    .filter_map(|m| m.get("content").and_then(|c| c.as_str()))
                    .map(|s| s.len())
                    .sum();
                chars / 4
            });

        let completion_tokens = resp_json.get("usage")
            .and_then(|u| u.get("completion_tokens"))
            .and_then(|v| v.as_u64())
            .or_else(|| resp_json.get("eval_count").and_then(|v| v.as_u64()))
            .map(|v| v as usize)
            .unwrap_or_else(|| raw_content.len() / 4);

        let total_tokens = prompt_tokens + completion_tokens;

        // 2. Auto-expansion dynamique si on s'approche de la limite (+1000 à +2048 tokens)
        let token_margin = 1000;
        let mut auto_expanded = false;
        if total_tokens + token_margin >= current_num_ctx && current_num_ctx < max_allowed_ctx {
            let expansion = 2048;
            let old_ctx = current_num_ctx;
            current_num_ctx = (current_num_ctx + expansion).min(max_allowed_ctx);
            auto_expanded = true;

            let _ = app.emit("agent:event", AgentStepEvent {
                step_type: "context_expanded".to_string(),
                content: format!(
                    "⚡ Approche de la limite ({} / {} tokens). Auto-expansion dynamique : +{} tokens alloués pour la suite (contexte étendu à {} tokens).",
                    total_tokens, old_ctx, expansion, current_num_ctx
                ),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                tool_id: None,
                token_usage: Some(TokenUsageMetrics {
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                    current_num_ctx,
                    max_tokens: current_max_tokens,
                    auto_expanded: true,
                }),
            });
        }

        // 3. Émission de la télémétrie de tokens en temps réel vers l'UI
        let _ = app.emit("agent:event", AgentStepEvent {
            step_type: "token_usage".to_string(),
            content: format!("{}/{} tokens", total_tokens, current_num_ctx),
            tool_name: None,
            tool_args: None,
            tool_result: None,
            tool_id: None,
            token_usage: Some(TokenUsageMetrics {
                prompt_tokens,
                completion_tokens,
                total_tokens,
                current_num_ctx,
                max_tokens: current_max_tokens,
                auto_expanded,
            }),
        });

        // Extraction des balises de réflexion <think>...</think> (Item 6)
        let (thought_opt, text_content) = AgentEngine::extract_and_strip_think_tags(&raw_content);

        if let Some(thought) = thought_opt {
            let _ = app.emit("agent:event", AgentStepEvent {
                step_type: "thought".to_string(),
                content: thought,
                tool_name: None,
                tool_args: None,
                tool_result: None,
                tool_id: None,
                token_usage: None,
            });
        }

        if !text_content.is_empty() {
            let _ = app.emit("agent:event", AgentStepEvent {
                step_type: "token".to_string(),
                content: text_content.clone(),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                tool_id: None,
                token_usage: None,
            });
        }

        // Ajouter la réponse de l'assistant à l'historique (avec balises <think> élaguées pour économiser les tokens de contexte)
        let mut clean_assistant_msg = assistant_msg.clone();
        if let Some(obj) = clean_assistant_msg.as_object_mut() {
            obj.insert("content".to_string(), json!(text_content));
        }
        messages.push(clean_assistant_msg);

        let mut executed_any_tool = false;

        // 1. Vérifier les tool_calls natifs éventuels
        let native_tool_calls = assistant_msg
            .get("tool_calls")
            .and_then(|tc| tc.as_array())
            .filter(|tc| !tc.is_empty());

        if let Some(tool_calls) = native_tool_calls {
            let all_read_only = tool_calls.len() > 1 && tool_calls.iter().all(|tc| {
                let fn_name = tc.get("function").and_then(|f| f.get("name")).and_then(|n| n.as_str()).unwrap_or("");
                is_read_only_tool(fn_name)
            });

            if all_read_only {
                // Parallélisation des outils en lecture seule (Section 3 - Accélération Concurrente)
                let mut tasks = Vec::new();
                for tc in tool_calls {
                    let call_id = tc.get("id").and_then(|id| id.as_str()).unwrap_or("call_1").to_string();
                    let fn_obj = tc.get("function");
                    let fn_name = fn_obj.and_then(|f| f.get("name")).and_then(|n| n.as_str()).unwrap_or("").to_string();
                    let fn_args = match fn_obj.and_then(|f| f.get("arguments")) {
                        Some(Value::String(s)) => serde_json::from_str(s).unwrap_or(json!({})),
                        Some(Value::Object(obj)) => Value::Object(obj.clone()),
                        _ => json!({}),
                    };

                    let _ = app.emit("agent:event", AgentStepEvent {
                        step_type: "tool_call".to_string(),
                        content: format!("Appel simultané de l'outil : {}", fn_name),
                        tool_name: Some(fn_name.clone()),
                        tool_args: Some(fn_args.clone()),
                        tool_result: None,
                        tool_id: Some(call_id.clone()),
                        token_usage: None,
                    });

                    let engine_c = engine.clone();
                    let tools_c = tools.clone();
                    let checkpoints_c = checkpoints.clone();
                    tasks.push(async move {
                        let res = match engine_c.execute_tool(&fn_name, &fn_args, &tools_c, &checkpoints_c).await {
                            Ok(r) => r,
                            Err(e) => json!({ "error": e }),
                        };
                        (call_id, fn_name, fn_args, res)
                    });
                }

                let results = futures_util::future::join_all(tasks).await;
                for (call_id, fn_name, fn_args, result) in results {
                    last_executed_tool = Some(fn_name.clone());
                    security::audit_log::AuditLogger::log(
                        &ws,
                        "agent",
                        "tool_call",
                        &fn_name,
                        if result.get("error").is_some() { "error" } else { "success" },
                        Some(fn_args),
                    );

                    let _ = app.emit("agent:event", AgentStepEvent {
                        step_type: "tool_result".to_string(),
                        content: format!("Résultat de {}", fn_name),
                        tool_name: Some(fn_name.clone()),
                        tool_args: None,
                        tool_result: Some(result.clone()),
                        tool_id: Some(call_id.clone()),
                        token_usage: None,
                    });

                    let content_str = truncate_tool_output(&result.to_string(), 3500);
                    messages.push(json!({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": fn_name,
                        "content": content_str
                    }));
                    executed_any_tool = true;
                }
            } else {
                for tc in tool_calls {
                    if *engine.is_aborted.lock().await {
                        let _ = app.emit("agent:event", AgentStepEvent {
                            step_type: "done".to_string(),
                            content: "Tâche interrompue par l'utilisateur.".to_string(),
                            tool_name: None,
                            tool_args: None,
                            tool_result: None,
                            tool_id: None,
                            token_usage: None,
                        });
                        break;
                    }

                    let call_id = tc.get("id").and_then(|id| id.as_str()).unwrap_or("call_1");
                    let fn_obj = tc.get("function");
                    let fn_name = fn_obj.and_then(|f| f.get("name")).and_then(|n| n.as_str()).unwrap_or("");
                    let fn_args = match fn_obj.and_then(|f| f.get("arguments")) {
                        Some(Value::String(s)) => serde_json::from_str(s).unwrap_or(json!({})),
                        Some(Value::Object(obj)) => Value::Object(obj.clone()),
                        _ => json!({}),
                    };

                    // Détection de boucle infinie avec nudge d'auto-correction (Item 3)
                    tool_history.push((fn_name.to_string(), fn_args.to_string()));
                    if tool_history.len() >= 3 {
                        let len = tool_history.len();
                        if tool_history[len - 1] == tool_history[len - 2] && tool_history[len - 2] == tool_history[len - 3] {
                            let _ = app.emit("agent:event", AgentStepEvent {
                                step_type: "error".to_string(),
                                content: format!("Interruption : Boucle infinie détectée sur l'outil '{}'.", fn_name),
                                tool_name: Some(fn_name.to_string()),
                                tool_args: None,
                                tool_result: None,
                                tool_id: None,
                                token_usage: None,
                            });
                            messages.push(json!({
                                "role": "user",
                                "content": format!("⚠️ ALERTE BOUCLE INFINIE : Tu as appelé l'outil `{}` 3 fois de suite avec les mêmes arguments sans progresser. Tu as l'INTERDICTION de réutiliser cet outil avec ces paramètres. Change immédiatement d'approche ou résume ton diagnostic.", fn_name)
                            }));
                            break;
                        }
                    }

                    let _ = app.emit("agent:event", AgentStepEvent {
                        step_type: "tool_call".to_string(),
                        content: format!("Appel de l'outil : {}", fn_name),
                        tool_name: Some(fn_name.to_string()),
                        tool_args: Some(fn_args.clone()),
                        tool_result: None,
                        tool_id: Some(call_id.to_string()),
                        token_usage: None,
                    });

                    // Exécution de l'outil
                    let result = match engine.execute_tool(fn_name, &fn_args, &tools, &checkpoints).await {
                        Ok(res) => res,
                        Err(err) => json!({ "error": err }),
                    };

                    if matches!(fn_name, "write_file" | "edit_file" | "delete_file" | "move_file") {
                        if let Some(p) = fn_args.get("path").or_else(|| fn_args.get("file")).and_then(|p| p.as_str()) {
                            if !modified_files.contains(&p.to_string()) {
                                modified_files.push(p.to_string());
                            }
                        }
                    }

                    last_executed_tool = Some(fn_name.to_string());

                    // Journal d'audit immuable (Item 17)
                    security::audit_log::AuditLogger::log(
                        &ws,
                        "agent",
                        "tool_call",
                        fn_name,
                        if result.get("error").is_some() { "error" } else { "success" },
                        Some(fn_args.clone()),
                    );

                    let _ = app.emit("agent:event", AgentStepEvent {
                        step_type: "tool_result".to_string(),
                        content: format!("Résultat de {}", fn_name),
                        tool_name: Some(fn_name.to_string()),
                        tool_args: None,
                        tool_result: Some(result.clone()),
                        tool_id: Some(call_id.to_string()),
                        token_usage: None,
                    });

                    let content_str = truncate_tool_output(&result.to_string(), 3500);

                    messages.push(json!({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": fn_name,
                        "content": content_str
                    }));
                    executed_any_tool = true;
                }
            }
        }

        // 2. Repli : analyser les appels d'outils dans le texte (markdown JSON, XML, JSON brut, bloc de code avec chemin)
        if !executed_any_tool {
            let fallback_calls = AgentEngine::parse_fallback_tool_calls(&text_content);
            for (call_idx, (fn_name, fn_args)) in fallback_calls.into_iter().enumerate() {
                if *engine.is_aborted.lock().await {
                    let _ = app.emit("agent:event", AgentStepEvent {
                        step_type: "done".to_string(),
                        content: "Tâche interrompue par l'utilisateur.".to_string(),
                        tool_name: None,
                        tool_args: None,
                        tool_result: None,
                        tool_id: None,
                        token_usage: None,
                    });
                    break;
                }

                let call_id = format!("fallback_call_{}_{}", iteration, call_idx);

                tool_history.push((fn_name.clone(), fn_args.to_string()));
                if tool_history.len() >= 3 {
                    let len = tool_history.len();
                    if tool_history[len - 1] == tool_history[len - 2] && tool_history[len - 2] == tool_history[len - 3] {
                        let _ = app.emit("agent:event", AgentStepEvent {
                            step_type: "error".to_string(),
                            content: format!("Interruption : Boucle infinie détectée sur l'outil '{}'.", fn_name),
                            tool_name: Some(fn_name.clone()),
                            tool_args: None,
                            tool_result: None,
                            tool_id: None,
                            token_usage: None,
                        });
                        break;
                    }
                }

                let _ = app.emit("agent:event", AgentStepEvent {
                    step_type: "tool_call".to_string(),
                    content: format!("Appel d'outil : {}", fn_name),
                    tool_name: Some(fn_name.clone()),
                    tool_args: Some(fn_args.clone()),
                    tool_result: None,
                    tool_id: Some(call_id.clone()),
                    token_usage: None,
                });

                let result = match engine.execute_fallback_tool(&fn_name, &fn_args, &tools, &checkpoints).await {
                    Ok(res) => res,
                    Err(err) => json!({ "error": err }),
                };

                if matches!(fn_name.as_str(), "write_file" | "edit_file" | "delete_file" | "move_file") {
                    if let Some(p) = fn_args.get("path").or_else(|| fn_args.get("file")).and_then(|p| p.as_str()) {
                        if !modified_files.contains(&p.to_string()) {
                            modified_files.push(p.to_string());
                        }
                    }
                }

                last_executed_tool = Some(fn_name.clone());

                // Journal d'audit immuable (Item 17)
                security::audit_log::AuditLogger::log(
                    &ws,
                    "agent",
                    "tool_call",
                    &fn_name,
                    if result.get("error").is_some() { "error" } else { "success" },
                    Some(fn_args.clone()),
                );

                let _ = app.emit("agent:event", AgentStepEvent {
                    step_type: "tool_result".to_string(),
                    content: format!("Résultat de {}", fn_name),
                    tool_name: Some(fn_name.clone()),
                    tool_args: None,
                    tool_result: Some(result.clone()),
                    tool_id: Some(call_id.clone()),
                    token_usage: None,
                });

                let content_str = truncate_tool_output(&result.to_string(), 3500);

                messages.push(json!({
                    "role": "user",
                    "content": format!("Observation pour l'outil `{}` : {}", fn_name, content_str)
                }));
                executed_any_tool = true;
            }
        }

        // Préparation de la suite pour la prochaine série : si le contexte est dense, compacter les anciens messages intermédiaires
        if total_tokens + 1500 >= current_num_ctx && messages.len() > 6 {
            messages = AgentEngine::compact_conversation_history(&messages, 4);

            let _ = app.emit("agent:event", AgentStepEvent {
                step_type: "thought".to_string(),
                content: "Contexte compacté : préparation réussie de l'espace mémoire pour la prochaine série.".to_string(),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                tool_id: None,
                token_usage: None,
            });
        }

        if !executed_any_tool {
            // Détection de coupure de tokens (finish_reason: length) ou fin de limite de réponse
            let finish_reason = resp_json.get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("finish_reason"))
                .and_then(|f| f.as_str())
                .unwrap_or("");

            let is_truncated_by_length = finish_reason == "length" 
                || (completion_tokens >= current_max_tokens.saturating_sub(25) && !text_content.trim().is_empty());

            if is_truncated_by_length && iteration < max_iter {
                // Expansion de la série suivante de +1024 tokens
                current_max_tokens = (current_max_tokens + 1024).min(32768);

                let _ = app.emit("agent:event", AgentStepEvent {
                    step_type: "thought".to_string(),
                    content: format!("Série de tokens atteinte ({} tokens générés). Préparation et déclenchement automatique de la série suivante (+1024 tokens alloués)...", completion_tokens),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    tool_id: None,
                    token_usage: Some(TokenUsageMetrics {
                        prompt_tokens,
                        completion_tokens,
                        total_tokens,
                        current_num_ctx,
                        max_tokens: current_max_tokens,
                        auto_expanded: true,
                    }),
                });

                messages.push(json!({
                    "role": "user",
                    "content": "La série de génération précédente a atteint la limite de tokens. Continue exactement là où tu t'es arrêté pour compléter la suite du code sans recommencer depuis le début."
                }));
                continue;
            }

            if last_executed_tool.as_deref() == Some("todo_write") && iteration < max_iter {
                let _ = app.emit("agent:event", AgentStepEvent {
                    step_type: "thought".to_string(),
                    content: "Plan d'action enregistré. Poursuite immédiate avec l'exécution des étapes et création des fichiers...".to_string(),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    tool_id: None,
                    token_usage: None,
                });
                messages.push(json!({
                    "role": "user",
                    "content": "Le plan d'action (todo_write) est bien enregistré. Tu as l'INTERDICTION de t'arrêter ici ! Réalise TOUT DE SUITE la première étape : appelle immédiatement `create_dir`, `write_file` ou `run_command` pour créer les fichiers réels dès maintenant !"
                }));
                last_executed_tool = None;
                continue;
            }
            // Aucun outil appelé, fin du cycle
            break;
        }
    }

    // Émission de la transaction multi-fichiers atomique pour rollback (Item 2)
    if let Some(tx_id) = &transaction_id {
        if !modified_files.is_empty() {
            let _ = app.emit("agent:transaction", json!({
                "transaction_id": tx_id,
                "modified_files": modified_files,
                "timestamp": chrono::Utc::now().to_rfc3339()
            }));
        }
    }

    // Boucle fermée TDD & validation automatique après modifications de fichiers (Item 1)
    if (approval_mode == ApprovalMode::Review || approval_mode == ApprovalMode::Debug || prompt.contains("/tdd") || prompt.to_lowercase().contains("test")) && !modified_files.is_empty() {
        let _ = app.emit("agent:event", AgentStepEvent {
            step_type: "thought".to_string(),
            content: "Lancement de la suite de tests pour validation en boucle fermée (TDD Loop)...".to_string(),
            tool_name: Some("run_test_suite".to_string()),
            tool_args: None,
            tool_result: None,
            tool_id: None,
            token_usage: None,
        });

        if let Ok(test_output) = tools.run_test_suite().await {
            let passed = test_output.get("passed").and_then(|p| p.as_bool()).unwrap_or(true);
            if !passed {
                let stdout = test_output.get("stdout").and_then(|s| s.as_str()).unwrap_or("");
                let stderr = test_output.get("stderr").and_then(|s| s.as_str()).unwrap_or("");
                let _ = app.emit("agent:event", AgentStepEvent {
                    step_type: "error".to_string(),
                    content: format!("Échec des tests post-génération :\n{}{}\nDémarrage de la boucle d'auto-réparation...", stdout, stderr),
                    tool_name: Some("run_test_suite".to_string()),
                    tool_args: None,
                    tool_result: Some(test_output.clone()),
                    tool_id: None,
                    token_usage: None,
                });

                // Auto-réparation TDD autonome (jusqu'à 2 itérations supplémentaires)
                let repair_prompt = format!(
                    "🚨 ÉCHEC DES TESTS UNITAIRES :\nstdout :\n{}\nstderr :\n{}\n\nCorrige immédiatement ce bogue ! Analyse les erreurs ci-dessus et utilise `edit_file` ou `write_file` pour réparer les fichiers.",
                    stdout, stderr
                );
                messages.push(json!({
                    "role": "user",
                    "content": repair_prompt
                }));

                let mut repair_iter = 0;
                while repair_iter < 2 && !*engine.is_aborted.lock().await {
                    repair_iter += 1;
                    let endpoint = if profile.api_url.ends_with("/v1") {
                        format!("{}/chat/completions", profile.api_url)
                    } else {
                        format!("{}/v1/chat/completions", profile.api_url.trim_end_matches('/'))
                    };

                    let repair_req_body = json!({
                        "model": profile.model_id,
                        "messages": messages,
                        "temperature": 0.1,
                        "top_p": 0.9,
                        "max_tokens": current_max_tokens,
                        "keep_alive": "15m",
                        "options": {
                            "num_ctx": current_num_ctx,
                            "temperature": 0.1,
                            "top_p": 0.9,
                            "repeat_penalty": 1.05,
                            "num_predict": current_max_tokens,
                            "keep_alive": "15m"
                        },
                        "tools": AgentEngine::get_tools_definitions(),
                        "tool_choice": "auto"
                    });

                    let mut r_req = persistent_client.post(&endpoint).json(&repair_req_body);
                    if let Some(key) = &profile.api_key {
                        if !key.trim().is_empty() {
                            r_req = r_req.bearer_auth(key);
                        }
                    }

                    let r_send_fut = r_req.send();
                    tokio::pin!(r_send_fut);
                    let mut r_cancelled = false;

                    let r_result = loop {
                        tokio::select! {
                            r = &mut r_send_fut => {
                                break Some(r);
                            }
                            _ = tokio::time::sleep(tokio::time::Duration::from_millis(150)) => {
                                if *engine.is_aborted.lock().await {
                                    r_cancelled = true;
                                    break None;
                                }
                            }
                        }
                    };

                    if r_cancelled || r_result.is_none() {
                        break;
                    }

                    if let Some(Ok(r_resp)) = r_result {
                        if let Ok(r_json) = r_resp.json::<Value>().await {
                            let r_choice = r_json.get("choices")
                                .and_then(|c| c.get(0))
                                .and_then(|c| c.get("message"))
                                .or_else(|| r_json.get("message"));

                            if let Some(r_msg) = r_choice {
                                let r_raw = r_msg.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string();
                                let mut clean_repair_msg = r_msg.clone();
                                if let Some(obj) = clean_repair_msg.as_object_mut() {
                                    obj.insert("content".to_string(), json!(r_raw));
                                }
                                messages.push(clean_repair_msg);

                                let r_native = r_msg.get("tool_calls").and_then(|tc| tc.as_array()).filter(|tc| !tc.is_empty());
                                let mut r_executed = false;
                                if let Some(tc_list) = r_native {
                                    for tc in tc_list {
                                        if *engine.is_aborted.lock().await {
                                            break;
                                        }
                                        let call_id = tc.get("id").and_then(|id| id.as_str()).unwrap_or("repair_call_1");
                                        let fn_obj = tc.get("function");
                                        let fn_name = fn_obj.and_then(|f| f.get("name")).and_then(|n| n.as_str()).unwrap_or("");
                                        let fn_args = match fn_obj.and_then(|f| f.get("arguments")) {
                                            Some(Value::String(s)) => serde_json::from_str(&s).unwrap_or(json!({})),
                                            Some(Value::Object(obj)) => Value::Object(obj.clone()),
                                            _ => json!({}),
                                        };

                                        let _ = app.emit("agent:event", AgentStepEvent {
                                            step_type: "tool_call".to_string(),
                                            content: format!("Auto-réparation : {}", fn_name),
                                            tool_name: Some(fn_name.to_string()),
                                            tool_args: Some(fn_args.clone()),
                                            tool_result: None,
                                            tool_id: Some(call_id.to_string()),
                                            token_usage: None,
                                        });

                                        let result = match engine.execute_tool(fn_name, &fn_args, &tools, &checkpoints).await {
                                            Ok(res) => res,
                                            Err(err) => json!({ "error": err }),
                                        };

                                        let _ = app.emit("agent:event", AgentStepEvent {
                                            step_type: "tool_result".to_string(),
                                            content: format!("Résultat auto-réparation : {}", fn_name),
                                            tool_name: Some(fn_name.to_string()),
                                            tool_args: None,
                                            tool_result: Some(result.clone()),
                                            tool_id: Some(call_id.to_string()),
                                            token_usage: None,
                                        });

                                        let content_str = truncate_tool_output(&result.to_string(), 3500);
                                        messages.push(json!({
                                            "role": "tool",
                                            "tool_call_id": call_id,
                                            "name": fn_name,
                                            "content": content_str
                                        }));
                                        r_executed = true;
                                    }
                                }

                                if r_executed {
                                    if let Ok(retest_output) = tools.run_test_suite().await {
                                        let retest_passed = retest_output.get("passed").and_then(|p| p.as_bool()).unwrap_or(false);
                                        if retest_passed {
                                            let _ = app.emit("agent:event", AgentStepEvent {
                                                step_type: "thought".to_string(),
                                                content: "🎉 Auto-réparation réussie ! Tous les tests passent avec succès après correction.".to_string(),
                                                tool_name: Some("run_test_suite".to_string()),
                                                tool_args: None,
                                                tool_result: Some(retest_output),
                                                tool_id: None,
                                                token_usage: None,
                                            });
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                let _ = app.emit("agent:event", AgentStepEvent {
                    step_type: "thought".to_string(),
                    content: "Validation TDD réussie : tous les tests passent avec succès !".to_string(),
                    tool_name: Some("run_test_suite".to_string()),
                    tool_args: None,
                    tool_result: Some(test_output),
                    tool_id: None,
                    token_usage: None,
                });
            }
        }
    }

    let _ = app.emit("agent:event", AgentStepEvent {
        step_type: "done".to_string(),
        content: "Tour de l'agent terminé avec succès.".to_string(),
        tool_name: None,
        tool_args: None,
        tool_result: None,
        tool_id: None,
        token_usage: None,
    });

    // Notification système de bureau (Item 52)
    let _ = std::process::Command::new("notify-send")
        .args(&["-i", "dialog-information", "Agent de Code Local", "Tâche d'édition terminée avec succès !"])
        .spawn();

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .manage(AppState {
            workspace_root: Mutex::new(std::env::current_dir().ok()),
            sandbox_config: Mutex::new(SandboxConfig::default()),
            current_agent: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            select_workspace_folder,
            get_system_status,
            get_hardware_metrics,
            get_hardware_status,
            unload_local_models,
            send_system_notification,
            open_workspace,
            list_workspace_files,
            read_workspace_file,
            write_workspace_file,
            delete_workspace_file,
            rename_workspace_file,
            create_workspace_dir,
            get_file_diff,
            execute_sandbox_command,
            list_checkpoints,
            restore_checkpoint,
            restore_file_checkpoint,
            rollback_transaction,
            get_workspace_symbols,
            hybrid_search_workspace,
            get_project_learnings,
            save_project_learning,
            delete_project_learning,
            run_test_suite_and_auto_repair,
            get_audit_logs,
            get_git_status,
            get_git_diff,
            get_git_log,
            get_git_branches,
            git_stage_file,
            git_unstage_file,
            git_commit,
            git_checkout_branch,
            git_create_branch,
            get_git_file_content,
            get_git_show,
            check_landlock_status,
            inspect_binary_file,
            profile_benchmark_command,
            analyze_local_image_file,
            test_model_connection,
            abort_agent,
            set_network_access,
            web_search,
            fetch_url,
            run_agent_loop,
            get_projects,
            save_project,
            delete_project,
            get_project_rules,
            set_project_rules,
            add_folder_to_project,
            remove_folder_from_project,
            inspect_sqlite_database,
            query_sqlite_database,
            grep_workspace_files,
            export_libreoffice_doc,
            generate_libreoffice_template,
            read_libreoffice_doc,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors de l'exécution de l'application Tauri");
}
