use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::time::timeout;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SandboxType {
    Bubblewrap,
    Docker,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    pub sandbox_type: SandboxType,
    pub allow_network: bool,
    pub air_gapped: bool,
    pub max_memory_mb: Option<u64>,
    pub max_cpu_time_secs: Option<u64>,
    pub enable_seccomp: bool,
    pub timeout_seconds: u64,
    pub max_output_bytes: usize,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            sandbox_type: SandboxType::Bubblewrap,
            allow_network: false,
            air_gapped: false,
            max_memory_mb: Some(4096), // 4GB max par défaut
            max_cpu_time_secs: Some(120),
            enable_seccomp: true,
            timeout_seconds: 30,
            max_output_bytes: 128 * 1024, // 128 KB
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub truncated: bool,
    pub duration_ms: u64,
}

#[derive(Error, Debug)]
pub enum SandboxError {
    #[error("Erreur de configuration du bac à sable : {0}")]
    ConfigError(String),
    #[error("Exécution de la commande expirée après {0}s")]
    Timeout(u64),
    #[error("Échec du lancement du processus : {0}")]
    ProcessSpawnError(String),
    #[error("Bubblewrap n'est pas disponible sur le système (/usr/bin/bwrap)")]
    BwrapNotFound,
    #[error("Docker n'est pas disponible sur le système")]
    DockerNotFound,
}

pub struct SandboxManager;

impl SandboxManager {
    /// Vérifie la présence de bubblewrap sur la machine
    pub fn is_bwrap_available() -> bool {
        Path::new("/usr/bin/bwrap").exists() || which::which("bwrap").is_ok()
    }

    /// Vérifie la présence de docker sur la machine
    pub fn is_docker_available() -> bool {
        which::which("docker").is_ok()
    }

    /// Construit la commande pour Bubblewrap
    /// Construit la commande pour Bubblewrap avec configuration de sécurité complète
    pub fn build_bwrap_command(
        workspace: &Path,
        command: &str,
        config: &SandboxConfig,
    ) -> Result<tokio::process::Command, SandboxError> {
        let bwrap_path = if Path::new("/usr/bin/bwrap").exists() {
            "/usr/bin/bwrap"
        } else {
            "bwrap"
        };

        let mut cmd = tokio::process::Command::new(bwrap_path);

        // 1. Isolation des namespaces
        cmd.arg("--unshare-all");
        // Mode Air-Gapped : interdiction absolue de réseau
        if config.allow_network && !config.air_gapped {
            cmd.arg("--share-net");
        }
        cmd.arg("--die-with-parent");

        if config.enable_seccomp {
            cmd.arg("--new-session");
        }

        // 2. Montages racine et bibliothèques en lecture seule
        let ro_mounts = [
            "/usr",
            "/bin",
            "/sbin",
            "/lib",
            "/lib64",
        ];

        for &mount in &ro_mounts {
            let path = Path::new(mount);
            if path.exists() {
                cmd.args(["--ro-bind", mount, mount]);
            }
        }

        // 3. Montages /etc nécessaires (exclure DNS si air-gapped)
        let etc_entries = if config.air_gapped || !config.allow_network {
            vec![
                "/etc/ssl",
                "/etc/pki",
                "/etc/ca-certificates",
                "/etc/alternatives",
                "/etc/ld.so.cache",
                "/etc/ld.so.conf",
                "/etc/ld.so.conf.d",
            ]
        } else {
            vec![
                "/etc/resolv.conf",
                "/etc/hosts",
                "/etc/ssl",
                "/etc/pki",
                "/etc/ca-certificates",
                "/etc/alternatives",
                "/etc/ld.so.cache",
                "/etc/ld.so.conf",
                "/etc/ld.so.conf.d",
            ]
        };

        for &entry in &etc_entries {
            let path = Path::new(entry);
            if path.exists() {
                cmd.args(["--ro-bind", entry, entry]);
            }
        }

        // 4. Systèmes de fichiers éphémères et pseudo-fs
        cmd.args(["--dev", "/dev"]);
        cmd.args(["--proc", "/proc"]);
        cmd.args(["--tmpfs", "/tmp"]);

        // 5. Dossier personnel fictif isolé
        cmd.args(["--dir", "/tmp/fakehome"]);
        cmd.args(["--setenv", "HOME", "/tmp/fakehome"]);

        // 6. Montage du workspace en lecture-écriture UNIQUEMENT
        let ws_str = workspace.to_string_lossy();
        cmd.args(["--bind", &ws_str, &ws_str]);
        cmd.args(["--chdir", &ws_str]);

        // 7. Nettoyage et assainissement des variables d'environnement
        cmd.args(["--clearenv"]);
        cmd.args(["--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin"]);
        cmd.args(["--setenv", "TERM", "xterm-256color"]);
        cmd.args(["--setenv", "LANG", "C.UTF-8"]);
        cmd.args(["--setenv", "PWD", &ws_str]);

        // 8. Quotas CPU et Mémoire via ulimit (Item 14)
        let mut prefix = String::new();
        if let Some(mem_mb) = config.max_memory_mb {
            prefix.push_str(&format!("ulimit -v {} 2>/dev/null; ", mem_mb * 1024));
        }
        if let Some(cpu_secs) = config.max_cpu_time_secs {
            prefix.push_str(&format!("ulimit -t {} 2>/dev/null; ", cpu_secs));
        }

        let final_cmd = format!("{}{}", prefix, command);
        cmd.args(["/bin/bash", "-c", &final_cmd]);

        // Nouveau groupe de processus
        cmd.process_group(0);

        Ok(cmd)
    }

    /// Exécute une commande selon la politique de sandbox définie
    pub async fn execute(
        workspace: &Path,
        command: &str,
        config: &SandboxConfig,
    ) -> Result<CommandOutput, SandboxError> {
        let start_time = std::time::Instant::now();

        let mut tokio_cmd = match config.sandbox_type {
            SandboxType::Bubblewrap => {
                if !Self::is_bwrap_available() {
                    return Err(SandboxError::BwrapNotFound);
                }
                Self::build_bwrap_command(workspace, command, config)?
            }
            SandboxType::Docker => {
                if !Self::is_docker_available() {
                    return Err(SandboxError::DockerNotFound);
                }
                let mut cmd = tokio::process::Command::new("docker");
                cmd.arg("run").arg("--rm");
                if !config.allow_network {
                    cmd.args(["--network", "none"]);
                }
                cmd.args(["--cap-drop", "ALL", "--security-opt", "no-new-privileges"]);
                let ws_str = workspace.to_string_lossy();
                cmd.args(["-v", &format!("{}:{}", ws_str, ws_str)]);
                cmd.args(["-w", &ws_str]);
                cmd.args(["alpine", "/bin/sh", "-c", command]);
                cmd.process_group(0);
                cmd
            }
            SandboxType::None => {
                let mut cmd = tokio::process::Command::new("/bin/bash");
                cmd.arg("-c").arg(command);
                cmd.current_dir(workspace);
                cmd.process_group(0);
                cmd
            }
        };

        tokio_cmd.stdout(Stdio::piped());
        tokio_cmd.stderr(Stdio::piped());

        let child = tokio_cmd.spawn().map_err(|e| {
            SandboxError::ProcessSpawnError(format!("Échec du lancement du processus: {}", e))
        })?;

        let child_pid = child.id();

        let output_fut = child.wait_with_output();

        let output = match timeout(Duration::from_secs(config.timeout_seconds), output_fut).await {
            Ok(res) => res.map_err(|e| {
                SandboxError::ProcessSpawnError(format!("Erreur lors de la capture de sortie: {}", e))
            })?,
            Err(_) => {
                if let Some(pid) = child_pid {
                    unsafe {
                        libc::kill(-(pid as i32), libc::SIGKILL);
                    }
                }
                return Err(SandboxError::Timeout(config.timeout_seconds));
            }
        };

        let duration_ms = start_time.elapsed().as_millis() as u64;

        let max_bytes = config.max_output_bytes;
        let mut stdout_raw = output.stdout;
        let mut stderr_raw = output.stderr;
        let mut truncated = false;

        if stdout_raw.len() > max_bytes {
            stdout_raw.truncate(max_bytes);
            truncated = true;
        }

        if stderr_raw.len() > max_bytes {
            stderr_raw.truncate(max_bytes);
            truncated = true;
        }

        let exit_code = output.status.code().unwrap_or(-1);

        Ok(CommandOutput {
            stdout: String::from_utf8_lossy(&stdout_raw).to_string(),
            stderr: String::from_utf8_lossy(&stderr_raw).to_string(),
            exit_code,
            truncated,
            duration_ms,
        })
    }
}
