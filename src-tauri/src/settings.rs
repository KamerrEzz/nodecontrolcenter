//! Local settings persistence: one JSON file in the app config directory.
//! No telemetry, no history of commands, nothing beyond the user preferences.

use std::fs;
use std::path::PathBuf;

use crate::model::AppSettings;

pub fn settings_path(config_dir: &PathBuf) -> PathBuf {
    config_dir.join("settings.json")
}

pub fn load(config_dir: &PathBuf) -> AppSettings {
    let path = settings_path(config_dir);
    match fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<AppSettings>(&raw) {
            Ok(mut s) => {
                sanitize(&mut s);
                s
            }
            Err(_) => AppSettings::default(),
        },
        Err(_) => AppSettings::default(),
    }
}

pub fn save(config_dir: &PathBuf, settings: &AppSettings) -> Result<(), String> {
    fs::create_dir_all(config_dir).map_err(|e| format!("could not create config directory: {e}"))?;
    let mut s = settings.clone();
    sanitize(&mut s);
    let raw = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
    fs::write(settings_path(config_dir), raw).map_err(|e| format!("could not write settings: {e}"))
}

/// Clamp values to sane ranges so a hand-edited file cannot break the app.
pub fn sanitize(s: &mut AppSettings) {
    s.refresh_interval_secs = s.refresh_interval_secs.clamp(2, 3600);
    s.long_running_threshold_hours = s.long_running_threshold_hours.clamp(0.1, 24.0 * 365.0);
    s.theme = if s.theme == "light" { "light".into() } else { "dark".into() };
    s.language = if s.language == "es" { "es".into() } else { "en".into() };
    s.favorite_ports.retain(|p| *p > 0);
    s.favorite_ports.sort_unstable();
    s.favorite_ports.dedup();
    s.dismissed_alert_keys.retain(|k| !k.is_empty());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::AppSettings;

    #[test]
    fn sanitize_clamps_refresh_interval() {
        let mut s = AppSettings { refresh_interval_secs: 0, ..Default::default() };
        sanitize(&mut s);
        assert_eq!(s.refresh_interval_secs, 2);
        s.refresh_interval_secs = 999_999;
        sanitize(&mut s);
        assert_eq!(s.refresh_interval_secs, 3600);
    }

    #[test]
    fn sanitize_filters_invalid_ports() {
        let mut s = AppSettings {
            favorite_ports: vec![3000, 0, 5173, 3000, 80],
            ..Default::default()
        };
        // Zero is dropped, duplicates are deduped, order is normalized.
        sanitize(&mut s);
        assert_eq!(s.favorite_ports, vec![80, 3000, 5173]);
    }

    #[test]
    fn sanitize_theme_fallback() {
        let mut s = AppSettings { theme: "neon".into(), ..Default::default() };
        sanitize(&mut s);
        assert_eq!(s.theme, "dark");
        s.theme = "light".into();
        sanitize(&mut s);
        assert_eq!(s.theme, "light");
    }

    #[test]
    fn sanitize_language_fallback() {
        let mut s = AppSettings { language: "fr".into(), ..Default::default() };
        sanitize(&mut s);
        assert_eq!(s.language, "en");
        s.language = "es".into();
        sanitize(&mut s);
        assert_eq!(s.language, "es");
    }

    #[test]
    fn roundtrip_through_json() {
        let dir = std::env::temp_dir().join(format!("ncc-test-{}", std::process::id()));
        let s = AppSettings { refresh_interval_secs: 7, ..Default::default() };
        save(&dir, &s).unwrap();
        let loaded = load(&dir);
        assert_eq!(loaded.refresh_interval_secs, 7);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_file_falls_back_to_defaults() {
        let dir = std::env::temp_dir().join(format!("ncc-test-corrupt-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(settings_path(&dir), "{not json").unwrap();
        let loaded = load(&dir);
        assert_eq!(loaded.refresh_interval_secs, 5);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
