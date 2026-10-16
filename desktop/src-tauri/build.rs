fn main() {
    // custom commands must be declared so a capability can allow them (the dashboard calls install_update from its remote origin)
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["install_update"])),
    )
    .expect("failed to run tauri build script");
}
