# Screenshot Workflow for Claude Code

Quick guide to paste screenshots directly when working with Claude Code.

---

## Quick Start

### Method 1: NPM Command (Recommended)

```bash
# 1. Take screenshot (Win+Shift+S)
# 2. Select area to capture
# 3. Run this command:
npm run screenshot

# 4. Path is copied to clipboard - paste it in your message to Claude
```

### Method 2: Direct PowerShell

```bash
# 1. Take screenshot (Win+Shift+S)
# 2. Run:
powershell -File scripts/paste-screenshot.ps1

# 3. Path is copied to clipboard
```

### Method 3: Bash Script

```bash
# 1. Take screenshot (Win+Shift+S)
# 2. Run:
./scripts/paste-screenshot.sh

# 3. Path is copied to clipboard
```

---

## Complete Workflow Example

**Scenario:** You want to show Claude an error message from your browser.

1. **Take the screenshot:**
   - Press `Win + Shift + S`
   - Your screen will dim
   - Select the area you want to capture
   - Screenshot is automatically copied to clipboard

2. **Save it with the helper:**
   ```bash
   npm run screenshot
   ```

   You'll see:
   ```
   ✅ Screenshot saved!

   File path:
     C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\screenshot_2026-01-22_10-30-45.png

   📋 Path copied to clipboard (ready to paste)!
   ```

3. **Share it with Claude:**
   - Type your message
   - Press `Ctrl + V` to paste the path
   - Claude will automatically read and analyze the image

   Example message:
   ```
   I'm getting this error: C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\screenshot_2026-01-22_10-30-45.png
   ```

---

## Keyboard Shortcuts

### Windows Screenshot Tools

| Shortcut | Action |
|----------|--------|
| `Win + Shift + S` | Snipping Tool (rectangular selection) |
| `Win + PrtScn` | Full screen screenshot (saves to Pictures/Screenshots) |
| `Alt + PrtScn` | Active window screenshot |
| `PrtScn` | Full screen to clipboard |

**Recommended:** Use `Win + Shift + S` for precise area selection.

---

## Where Screenshots Are Saved

Screenshots are saved to:
```
C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\
```

Filename format:
```
screenshot_YYYY-MM-DD_HH-MM-SS.png
```

Example:
```
screenshot_2026-01-22_10-30-45.png
```

---

## Tips and Tricks

### 1. Quick Multi-Screenshot Workflow

When you need to share multiple screenshots:

```bash
# Take screenshot 1 (Win+Shift+S)
npm run screenshot
# Save path somewhere (notepad, etc.)

# Take screenshot 2 (Win+Shift+S)
npm run screenshot
# Save path somewhere

# Then paste all paths in one message:
```

Example message to Claude:
```
I'm seeing issues in three places:

1. The error dialog: C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\screenshot_2026-01-22_10-30-45.png

2. The console output: C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\screenshot_2026-01-22_10-31-12.png

3. The network tab: C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\screenshot_2026-01-22_10-31-34.png

Can you help me debug this?
```

### 2. Annotate Screenshots

Before capturing, you can annotate:
- Use Windows Ink (if available)
- Use Paint / Paint 3D to add arrows, highlights, text
- Then copy to clipboard (`Ctrl + C` in Paint)
- Run `npm run screenshot`

### 3. Clean Up Old Screenshots

Screenshots are in temp folder and will be cleaned automatically by Windows, but you can manually clean:

```bash
# PowerShell - delete screenshots older than 7 days
Remove-Item "$env:TEMP\claude-screenshots\*" -Force -Recurse -Include *.png
```

### 4. Create a Desktop Shortcut (Advanced)

Create `Save Screenshot.bat` on your desktop:
```batch
@echo off
cd /d "C:\Users\Bridg\Projects\correspondence-clerk"
powershell -ExecutionPolicy Bypass -File scripts/paste-screenshot.ps1
pause
```

Double-click to save clipboard screenshot.

---

## Troubleshooting

### "No image found in clipboard"

**Problem:** Script says no image in clipboard.

**Solution:**
1. Make sure you took a screenshot first (`Win + Shift + S`)
2. Or copy an image file (`Ctrl + C` on image in File Explorer)
3. Then run the script

### "Execution Policy" Error

**Problem:** PowerShell script won't run due to execution policy.

**Solution:**
```bash
# Run with bypass flag (already included in npm script)
powershell -ExecutionPolicy Bypass -File scripts/paste-screenshot.ps1
```

Or set execution policy permanently (admin required):
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Path Has Spaces

**Problem:** Path has spaces and breaks when pasted.

**Solution:** Paths are automatically generated without spaces, but if issues occur:
```bash
# Wrap in quotes when pasting:
"C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\screenshot_2026-01-22_10-30-45.png"
```

---

## Alternative: Direct Image Files

You can also just copy existing image files:

1. **Find your image** in File Explorer
2. **Copy the file path:**
   - Right-click file
   - Hold `Shift` key
   - Click "Copy as path"
3. **Paste in message to Claude:**
   ```
   Check this image: C:\Users\Bridg\Pictures\error.png
   ```

---

## How It Works

1. **Windows Clipboard:** When you take a screenshot, Windows stores the image in clipboard
2. **PowerShell Script:** Reads the clipboard image data
3. **Save to Disk:** Converts to PNG and saves with timestamp
4. **Copy Path:** Puts the file path back in clipboard
5. **Claude Reads:** When you paste the path, Claude's Read tool loads the image

---

## Summary

**Fastest Workflow:**
1. `Win + Shift + S` → Select area
2. `npm run screenshot` → Save and get path
3. `Ctrl + V` in message → Share with Claude

**That's it!** Simple and fast. 🚀

---

## Need Help?

If you encounter issues:
1. Check that you took a screenshot first
2. Verify PowerShell script runs: `powershell -File scripts/paste-screenshot.ps1`
3. Check temp folder exists: `echo $env:TEMP\claude-screenshots`
4. Try taking a fresh screenshot and running again

For bugs or improvements, ask Claude! 😊
