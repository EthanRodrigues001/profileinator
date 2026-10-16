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
            let hq_name = if cfg!(windows) { "hq.exe" } else { "hq" };
            // installed: hq and ui/ are bundled resources. Source checkout: hq sits beside this exe and ui/out is in the project root.
            let res = app.path().resource_dir().ok();
            let bundled = res.as_ref().map(|r| (r.join("bin").join(hq_name), r.join("ui"))).filter(|(h, u)| h.exists() && u.join("index.html").exists());
            let (hq, ui): (PathBuf, PathBuf) = bundled.unwrap_or_else(|| {
                let home: PathBuf = exe.ancestors().nth(5).map(PathBuf::from).unwrap_or_default();
                (exe.with_file_name(hq_name), home.join("ui/out"))
            });
            let child = Command::new(hq)
                .args(["ui", &PORT.to_string(), "--no-open"])
                .env("HQ_UI", ui)
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
