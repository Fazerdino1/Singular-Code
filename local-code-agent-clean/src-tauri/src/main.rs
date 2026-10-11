// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Correctif officiel WebKitGTK pour Linux Wayland (évite le crash "Error 71 dispatching to Wayland display")
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    
    // Si Wayland pose problème avec le compositeur, fallback gracieux sur XWayland
    if std::env::var("GDK_BACKEND").is_err() {
        std::env::set_var("GDK_BACKEND", "x11,wayland");
    }

    local_code_agent_lib::run();
}
