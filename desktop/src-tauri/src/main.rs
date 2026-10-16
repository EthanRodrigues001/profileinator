// Native shell: starts the `hq` core next to this exe, waits for it, then opens it in a real window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{net::TcpStream, path::PathBuf, process::{Child, Command}, sync::Mutex, time::Duration};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const PORT: u16 = 4777;

trait HideConsole {
    fn hide_console(&mut self) -> &mut Self;
}
impl HideConsole for Command {
    #[cfg(windows)]
    fn hide_console(&mut self) -> &mut Self {
        std::os::windows::process::CommandExt::creation_flags(self, 0x0800_0000)
    }
    #[cfg(not(windows))]
    fn hide_console(&mut self) -> &mut Self {
        self
    }
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let exe = std::env::current_exe()?;
            // target/release/profileinator.exe -> .../profileinator (the project root)
            let home: PathBuf = exe.ancestors().nth(5).map(PathBuf::from).unwrap_or_default();
            let child = Command::new(exe.with_file_name("hq.exe"))
                .args(["ui", &PORT.to_string(), "--no-open"])
                .env("HQ_UI", home.join("ui/out"))
                .hide_console()
                .spawn()
                .ok();
            app.manage(Mutex::new(child));
            let addr = format!("127.0.0.1:{PORT}").parse().unwrap();
            for _ in 0..60 {
                if TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok() { break; }
                std::thread::sleep(Duration::from_millis(100));
            }
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(format!("http://127.0.0.1:{PORT}").parse().unwrap()))
                .title("Profileinator")
                .inner_size(1320.0, 840.0)
                .min_inner_size(900.0, 600.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build app");
    app.run(|h, e| {
        if let RunEvent::Exit = e {
            if let Some(c) = h.try_state::<Mutex<Option<Child>>>() {
                if let Some(ch) = c.lock().unwrap().as_mut() { let _ = ch.kill(); }
            }
        }
    });
}
