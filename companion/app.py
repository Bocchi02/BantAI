"""Nontechnical Windows tray host for the local BantAI detector service."""

from __future__ import annotations

import os
import sys
import threading
import webbrowser
from pathlib import Path
from tkinter import messagebox

import pystray
import uvicorn
from PIL import Image, ImageDraw


def resource_root() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))


ROOT = resource_root()
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

os.environ.setdefault("BANTAI_MODEL_DIR", str(ROOT / "models" / "email_text_xlmr_v1" / "checkpoint-15666"))
os.environ.setdefault("BANTAI_RF_MODEL_PATH", str(ROOT / "models" / "url_random_forest_v4b" / "bantai_rf_url_model_v4b_optimized.joblib"))
os.environ.setdefault("BANTAI_PLATFORM_API", "http://127.0.0.1:8080")
os.environ.setdefault("BANTAI_WEB_DASHBOARD", "http://localhost:3000")

import server  # noqa: E402


class CompanionTray:
    def __init__(self) -> None:
        self.server: uvicorn.Server | None = None
        self.server_thread: threading.Thread | None = None
        self.icon = pystray.Icon(
            "BantAI",
            self._icon_image(),
            "BantAI is starting",
            menu=pystray.Menu(
                pystray.MenuItem("BantAI is protecting you", lambda: None, enabled=False),
                pystray.MenuItem("Open web dashboard", self.open_dashboard),
                pystray.MenuItem("Restart BantAI", self.restart),
                pystray.MenuItem("Repair / verify models", self.repair),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Exit", self.exit),
            ),
        )

    @staticmethod
    def _icon_image() -> Image.Image:
        image = Image.new("RGBA", (64, 64), "#102E4A")
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((5, 5, 59, 59), radius=16, fill="#102E4A")
        draw.text((21, 12), "B", fill="white", font=None, stroke_width=1)
        draw.ellipse((43, 43, 55, 55), fill="#28A98F")
        return image

    def start_server(self) -> None:
        config = uvicorn.Config(server.app, host="127.0.0.1", port=8000, log_level="warning")
        self.server = uvicorn.Server(config)
        self.server_thread = threading.Thread(target=self.server.run, name="bantai-local-api", daemon=True)
        self.server_thread.start()
        self.icon.title = "BantAI is protecting you"

    def stop_server(self) -> None:
        if self.server is not None:
            self.server.should_exit = True
        if self.server_thread is not None:
            self.server_thread.join(timeout=20)

    def open_dashboard(self, *_args) -> None:
        webbrowser.open(os.getenv("BANTAI_WEB_DASHBOARD", "http://localhost:3000"))

    def restart(self, *_args) -> None:
        self.icon.title = "BantAI is restarting"
        self.stop_server()
        self.start_server()

    def repair(self, *_args) -> None:
        expected = [
            Path(os.environ["BANTAI_MODEL_DIR"]) / "config.json",
            Path(os.environ["BANTAI_MODEL_DIR"]) / "model.safetensors",
            Path(os.environ["BANTAI_RF_MODEL_PATH"]),
        ]
        missing = [path.name for path in expected if not path.is_file()]
        if missing:
            messagebox.showerror("BantAI needs attention", "Required detector files are missing. Reinstall BantAI Companion to repair them.")
        else:
            messagebox.showinfo("BantAI is ready", "The frozen detector files are present. Restart BantAI if a check is still unavailable.")

    def exit(self, *_args) -> None:
        self.stop_server()
        self.icon.stop()

    def run(self) -> None:
        self.start_server()
        self.icon.run()


if __name__ == "__main__":
    CompanionTray().run()
