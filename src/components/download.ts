import { Capacitor } from "@capacitor/core";

/**
 * Saves text content as a file.
 * - Browser: triggers a normal download.
 * - Android app: the WebView has no download manager, so the file is written to the app's
 *   cache and handed to the system share sheet (save to Drive, Files, email, WhatsApp...).
 */
export async function downloadText(filename: string, content: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const written = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, files: [written.uri], dialogTitle: `Save ${filename}` });
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
