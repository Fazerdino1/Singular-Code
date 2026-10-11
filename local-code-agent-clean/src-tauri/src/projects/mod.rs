use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub folders: Vec<String>,
    pub rules: String,
    pub is_cloud_sync: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ProjectsManager;

impl ProjectsManager {
    /// Retourne le chemin du fichier de configuration global des projets (~/.config/local-code-agent/projects.json)
    fn get_projects_config_path() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let config_dir = PathBuf::from(home).join(".config").join("local-code-agent");
        let _ = fs::create_dir_all(&config_dir);
        config_dir.join("projects.json")
    }

    /// Charge la liste des projets existants
    pub fn list_projects(current_ws: Option<&Path>) -> Result<Vec<ProjectConfig>, String> {
        let path = Self::get_projects_config_path();

        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(projects) = serde_json::from_str::<Vec<ProjectConfig>>(&content) {
                    return Ok(projects);
                }
            }
        }

        // Si aucun fichier ou vide, initialiser avec un projet par défaut basé sur le workspace actif
        let default_folder = current_ws
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| {
                std::env::current_dir()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| "/home/fazerdino1/Documents/antigravity/proud-volta".to_string())
            });

        let default_name = Path::new(&default_folder)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("proud-volta")
            .to_string();

        let initial_projects = vec![
            ProjectConfig {
                id: "project-cli".to_string(),
                name: "CLI Project".to_string(),
                icon: Some("cloud".to_string()),
                folders: vec![],
                rules: "# Règles du CLI Project\n- Développer des outils CLI autonomes et rapides en Rust/Go.\n- Pas de dépendances lourdes inutiles.".to_string(),
                is_cloud_sync: Some(true),
                created_at: "2026-10-01T10:00:00Z".to_string(),
                updated_at: "2026-10-01T10:00:00Z".to_string(),
            },
            ProjectConfig {
                id: "project-proud-volta".to_string(),
                name: default_name,
                icon: Some("folder".to_string()),
                folders: vec![default_folder.clone()],
                rules: "# Directives du Projet Singular Code\n- Architecture Tauri 2 + Rust + React + Monaco.\n- Sandbox Bubblewrap stricte et confinement Landlock.\n- Suivre les conventions Conventional Commits.".to_string(),
                is_cloud_sync: Some(false),
                created_at: "2026-10-05T08:00:00Z".to_string(),
                updated_at: "2026-10-10T20:00:00Z".to_string(),
            },
            ProjectConfig {
                id: "project-splendid-davinci".to_string(),
                name: "splendid-davinci".to_string(),
                icon: Some("folder".to_string()),
                folders: vec![],
                rules: "# Règles splendides\n- Prototypage rapide d'algorithmes et d'art génératif.".to_string(),
                is_cloud_sync: Some(false),
                created_at: "2026-10-06T12:00:00Z".to_string(),
                updated_at: "2026-10-06T12:00:00Z".to_string(),
            },
            ProjectConfig {
                id: "project-lively-darwin".to_string(),
                name: "lively-darwin".to_string(),
                icon: Some("folder".to_string()),
                folders: vec![],
                rules: "# Règles Lively Darwin\n- Moteur d'évolution génétique et simulations physiques.".to_string(),
                is_cloud_sync: Some(false),
                created_at: "2026-10-07T14:00:00Z".to_string(),
                updated_at: "2026-10-07T14:00:00Z".to_string(),
            },
            ProjectConfig {
                id: "project-antigravity-x64".to_string(),
                name: "Antigravity-x64".to_string(),
                icon: Some("folder".to_string()),
                folders: vec![],
                rules: "# Règles Antigravity Linux\n- Cible Linux x86_64, Wayland/X11 et isolation kernel.".to_string(),
                is_cloud_sync: Some(false),
                created_at: "2026-10-08T09:00:00Z".to_string(),
                updated_at: "2026-10-08T09:00:00Z".to_string(),
            },
            ProjectConfig {
                id: "project-zealous-shannon".to_string(),
                name: "zealous-shannon".to_string(),
                icon: Some("folder".to_string()),
                folders: vec![],
                rules: "# Moteur Sonic Boost\n- Performance temps réel, 60 FPS, zéro allocation sur la boucle principale.".to_string(),
                is_cloud_sync: Some(false),
                created_at: "2026-10-09T18:00:00Z".to_string(),
                updated_at: "2026-10-09T18:00:00Z".to_string(),
            },
        ];

        let _ = Self::save_all_projects(&initial_projects);
        Ok(initial_projects)
    }

    /// Sauvegarde l'ensemble des projets
    pub fn save_all_projects(projects: &[ProjectConfig]) -> Result<(), String> {
        let path = Self::get_projects_config_path();
        let content = serde_json::to_string_pretty(projects)
            .map_err(|e| format!("Erreur sérialisation projets : {}", e))?;
        fs::write(&path, content)
            .map_err(|e| format!("Erreur écriture fichier projets : {}", e))?;
        Ok(())
    }

    /// Ajoute ou met à jour un projet
    pub fn save_project(project: ProjectConfig, current_ws: Option<&Path>) -> Result<(), String> {
        let mut projects = Self::list_projects(current_ws)?;
        if let Some(pos) = projects.iter().position(|p| p.id == project.id) {
            projects[pos] = project.clone();
        } else {
            projects.push(project.clone());
        }

        Self::save_all_projects(&projects)?;

        // Si le projet a des dossiers et des règles, synchroniser aussi .localagent/rules.md dans le premier dossier
        if let Some(first_folder) = project.folders.first() {
            let rules_dir = Path::new(first_folder).join(".localagent");
            let _ = fs::create_dir_all(&rules_dir);
            let rules_file = rules_dir.join("rules.md");
            let _ = fs::write(rules_file, &project.rules);
        }

        Ok(())
    }

    /// Supprime un projet
    pub fn delete_project(id: &str, current_ws: Option<&Path>) -> Result<(), String> {
        let mut projects = Self::list_projects(current_ws)?;
        projects.retain(|p| p.id != id);
        Self::save_all_projects(&projects)?;
        Ok(())
    }

    /// Récupère les règles d'un projet spécifique
    pub fn get_project_rules(id: &str, current_ws: Option<&Path>) -> Result<String, String> {
        let projects = Self::list_projects(current_ws)?;
        if let Some(project) = projects.into_iter().find(|p| p.id == id) {
            Ok(project.rules)
        } else {
            Err(format!("Projet introuvable : {}", id))
        }
    }

    /// Met à jour les règles d'un projet
    pub fn set_project_rules(id: &str, rules: &str, current_ws: Option<&Path>) -> Result<(), String> {
        let mut projects = Self::list_projects(current_ws)?;
        if let Some(project) = projects.iter_mut().find(|p| p.id == id) {
            project.rules = rules.to_string();
            project.updated_at = chrono::Utc::now().to_rfc3339();

            if let Some(first_folder) = project.folders.first() {
                let rules_dir = Path::new(first_folder).join(".localagent");
                let _ = fs::create_dir_all(&rules_dir);
                let rules_file = rules_dir.join("rules.md");
                let _ = fs::write(rules_file, rules);
            }

            let cloned = projects.clone();
            Self::save_all_projects(&cloned)?;
            Ok(())
        } else {
            Err(format!("Projet introuvable : {}", id))
        }
    }

    /// Ajoute un dossier à un projet
    pub fn add_folder_to_project(id: &str, folder_path: &str, current_ws: Option<&Path>) -> Result<(), String> {
        let mut projects = Self::list_projects(current_ws)?;
        if let Some(project) = projects.iter_mut().find(|p| p.id == id) {
            if !project.folders.contains(&folder_path.to_string()) {
                project.folders.push(folder_path.to_string());
                project.updated_at = chrono::Utc::now().to_rfc3339();
                let cloned = projects.clone();
                Self::save_all_projects(&cloned)?;
            }
            Ok(())
        } else {
            Err(format!("Projet introuvable : {}", id))
        }
    }

    /// Retire un dossier d'un projet
    pub fn remove_folder_from_project(id: &str, folder_path: &str, current_ws: Option<&Path>) -> Result<(), String> {
        let mut projects = Self::list_projects(current_ws)?;
        if let Some(project) = projects.iter_mut().find(|p| p.id == id) {
            project.folders.retain(|f| f != folder_path);
            project.updated_at = chrono::Utc::now().to_rfc3339();
            let cloned = projects.clone();
            Self::save_all_projects(&cloned)?;
            Ok(())
        } else {
            Err(format!("Projet introuvable : {}", id))
        }
    }
}
