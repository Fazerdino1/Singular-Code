use std::fs;
use local_code_agent_lib::security::{ConfinementError, SandboxConfig};
use local_code_agent_lib::tools::{ToolError, ToolRegistry};

#[tokio::test]
async fn test_phase_7_end_to_end_security_and_agent_confinement() {
    println!("\n=======================================================");
    println!("DÉMARRAGE DU TEST DE BOUT EN BOUT : SÉCURITÉ & CONFINEMENT");
    println!("=======================================================\n");

    // 1. Création d'un dossier de workspace de test isolé
    let test_ws = std::env::current_dir()
        .unwrap()
        .join("target")
        .join("e2e_test_workspace");
    
    if test_ws.exists() {
        let _ = fs::remove_dir_all(&test_ws);
    }
    fs::create_dir_all(&test_ws).unwrap();
    let canonical_ws = fs::canonicalize(&test_ws).unwrap();

    let registry = ToolRegistry::new(&canonical_ws, SandboxConfig::default()).unwrap();

    // 2. L'agent crée des fichiers légitimes dans son projet
    println!("-> [TEST 1] Création de fichiers du projet dans le workspace...");
    registry.write_file("main.py", "print('Hello from Singular Code!')\n").unwrap();
    registry.write_file("src/utils.py", "def add(a, b):\n    return a + b\n").unwrap();
    registry.write_file("README.md", "# Test Project\n").unwrap();

    let content_main = registry.read_file("main.py", None, None).unwrap();
    assert!(content_main.contains("Hello from Singular Code"));
    println!("   ✓ Fichiers créés et lus avec succès dans le workspace.");

    // 3. Modification ciblée avec edit_file
    println!("-> [TEST 2] Édition chirurgicale de fichier (edit_file)...");
    registry.edit_file("main.py", "Hello from Singular Code!", "Bienvenue dans le code sécurisé!").unwrap();
    let modified = registry.read_file("main.py", None, None).unwrap();
    assert!(modified.contains("Bienvenue dans le code sécurisé!"));
    println!("   ✓ edit_file exécuté et validé.");

    // 4. Tentative d'évasion 1 : Sortie par traversée relative (../../etc/passwd)
    println!("-> [TEST 3] Tentative d'accès hors workspace via traversée relative (../../etc/passwd)...");
    let escape_rel = registry.read_file("../../etc/passwd", None, None);
    assert!(matches!(escape_rel, Err(ToolError::Security(ConfinementError::PathEscaped(_)))));
    println!("   ✓ BLOQUÉ : Traversal relatif interdit par PathConfinement.");

    // 5. Tentative d'évasion 2 : Accès direct à un fichier absolu externe (/etc/shadow)
    println!("-> [TEST 4] Tentative d'accès absolu système (/etc/shadow)...");
    let escape_abs = registry.read_file("/etc/shadow", None, None);
    assert!(matches!(escape_abs, Err(ToolError::Security(ConfinementError::PathEscaped(_)))));
    println!("   ✓ BLOQUÉ : Chemin absolu hors workspace interdit par PathConfinement.");

    // 6. Tentative d'évasion 3 : Accès aux fichiers sensibles (.env, clés SSH)
    println!("-> [TEST 5] Tentative d'accès à des fichiers sensibles (.env)...");
    let sensitive_env = registry.write_file(".env", "SECRET=1234");
    assert!(matches!(sensitive_env, Err(ToolError::Security(ConfinementError::SensitiveFileBlocked(_)))));
    println!("   ✓ BLOQUÉ : Fichier d'informations sensibles protégé.");

    // 7. Tentative d'évasion 4 : Commande destructrice shell (rm -rf ~)
    println!("-> [TEST 6] Tentative de commande destructrice shell (rm -rf ~)...");
    let rm_rf_home = registry.run_command("rm -rf ~").await;
    assert!(rm_rf_home.is_err());
    let err_msg = rm_rf_home.unwrap_err().to_string();
    assert!(err_msg.contains("COMMANDE DESTRUCTRICE BLOQUÉE"));
    println!("   ✓ BLOQUÉ : rm -rf ~ intercepté par CommandBlocklist avant tout shell.");

    // 8. Tentative d'évasion 5 : Escalade de privilèges (sudo cat /etc/shadow)
    println!("-> [TEST 7] Tentative d'escalade root (sudo cat /etc/shadow)...");
    let sudo_cmd = registry.run_command("sudo cat /etc/shadow").await;
    assert!(sudo_cmd.is_err());
    let err_sudo = sudo_cmd.unwrap_err().to_string();
    assert!(err_sudo.contains("PRIVILÈGES ROOT INTERDITE"));
    println!("   ✓ BLOQUÉ : sudo intercepté et refusé catégoriquement.");

    // 9. Tentative d'évasion 6 : Fork bomb
    println!("-> [TEST 8] Tentative de fork bomb (:(){{ :|:& }};:)...");
    let fork_bomb = registry.run_command(":(){ :|:& };:").await;
    assert!(fork_bomb.is_err());
    println!("   ✓ BLOQUÉ : Fork bomb neutralisée.");

    // 10. Nettoyage
    let _ = fs::remove_dir_all(&test_ws);

    println!("\n=======================================================");
    println!("TOUS LES 8 TESTS DE SÉCURITÉ DE BOUT EN BOUT SONT VERTS !");
    println!("L'AGENT EST STRICTEMENT ET TOTALEMENT CONFINÉ.");
    println!("=======================================================\n");
}
