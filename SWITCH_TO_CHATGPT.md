# How to Switch from Claude to ChatGPT in Cursor

This guide explains how to switch Cursor from using Claude Code to using ChatGPT (GPT-4) for continuing development.

## Prerequisites

Before you begin, make sure you have:
- Cursor installed on your computer
- An OpenAI API key (get one at https://platform.openai.com/api-keys)
- This project open in Cursor

## Step 1: Open Cursor Settings

**Windows/Linux:**
Press `Ctrl + ,` (Control key and comma key together)

**Mac:**
Press `Cmd + ,` (Command key and comma key together)

**Alternative method:**
Click the gear icon ⚙️ in the bottom left corner of Cursor, then select "Settings"

## Step 2: Navigate to Models Settings

1. In the settings window, look for the left sidebar
2. Click on **"Models"** in the sidebar
3. You should see a section about AI models

## Step 3: Switch to OpenAI (ChatGPT)

1. Look for the **"Model"** or **"AI Provider"** dropdown
2. Change it from "Anthropic (Claude)" to **"OpenAI (GPT-4)"**
3. You may see options like:
   - `gpt-4-turbo-preview`
   - `gpt-4`
   - `gpt-4o`

   Choose **`gpt-4o`** (recommended) or **`gpt-4-turbo-preview`**

## Step 4: Configure Your OpenAI API Key

1. Find the **"OpenAI API Key"** field in settings
2. Click in the field
3. Paste your OpenAI API key
   - It should look like: `sk-proj-...` (starts with "sk-")
4. The key will be saved automatically

**Don't have an API key?**
1. Go to https://platform.openai.com/api-keys
2. Sign in with your OpenAI account
3. Click "Create new secret key"
4. Copy the key (you won't be able to see it again!)
5. Paste it into Cursor settings

## Step 5: Verify the Switch

1. Close the settings window
2. Look at the **bottom right corner** of Cursor
3. You should see an indicator that says "GPT-4" or "gpt-4o" instead of "Claude"

## Step 6: Send Your First Prompt to ChatGPT

Now you need to give ChatGPT context about this project.

1. In Cursor's chat panel (press `Ctrl+L` on Windows/Linux or `Cmd+L` on Mac to open it)
2. Copy the entire contents of **`CHATGPT_INITIAL_PROMPT.txt`** from this project folder
3. Paste it into the chat and press Enter
4. Wait for ChatGPT to respond confirming it understands the project

ChatGPT will ask if you've read HANDOFF.md. You can say "yes" - it's mainly for ChatGPT's benefit, not yours.

## Troubleshooting

### "Invalid API Key" Error

**Problem:** Cursor says your OpenAI API key is invalid.

**Solutions:**
- Make sure you copied the entire key (starts with `sk-`)
- Check that you created a new key at https://platform.openai.com/api-keys
- Verify you have billing set up on your OpenAI account
- Try creating a new API key and pasting it again

### "Rate Limit Exceeded" Error

**Problem:** You're hitting API usage limits.

**Solutions:**
- Check your usage at https://platform.openai.com/usage
- Upgrade your OpenAI plan if needed
- Wait a few minutes and try again

### GPT-4 Not Showing Up

**Problem:** You can't find GPT-4 in the model list.

**Solutions:**
- Make sure you have GPT-4 API access (not just ChatGPT Plus)
- Check https://platform.openai.com/docs/models to see which models you can access
- Try selecting "gpt-3.5-turbo" temporarily if GPT-4 isn't available

### Status Bar Still Shows Claude

**Problem:** Bottom right corner still shows "Claude" after switching.

**Solutions:**
- Restart Cursor completely (close and reopen)
- Check that you saved the settings
- Try switching models again in settings

### Can't Find Settings

**Problem:** Settings window won't open.

**Solutions:**
- Try the menu: File → Preferences → Settings
- Or click the gear icon ⚙️ in the bottom left corner
- Restart Cursor if settings are unresponsive

## Switching Back to Claude

If you need to switch back to Claude Code:

1. Open Settings (`Ctrl+,` or `Cmd+,`)
2. Go to "Models"
3. Change the model back to "Anthropic (Claude)"
4. Enter your Anthropic API key if needed
5. Restart Cursor

## What Happens Next?

Once you've switched to ChatGPT and sent the initial prompt:

1. ChatGPT will have full context about the Correspondence Clerk project
2. It will understand the 10 Hard Rules that must never be violated
3. It will know the current state of the codebase and recent changes
4. You can ask it to continue development, fix bugs, or add features

**Important:** ChatGPT will follow the exact same constraints Claude used:
- Preserve user wording exactly (no AI rewriting)
- Enforce forced filing (business + contact required)
- Never invent content or suggestions
- Fail gracefully when AI is unavailable

## Need Help?

If you run into issues not covered here:

1. Check Cursor's documentation: https://docs.cursor.com
2. Check OpenAI's documentation: https://platform.openai.com/docs
3. Ask ChatGPT for help troubleshooting (once you get it connected)
4. Try searching for the error message online

## Summary Checklist

- [ ] Opened Cursor Settings
- [ ] Switched model to OpenAI (GPT-4)
- [ ] Pasted OpenAI API key
- [ ] Verified status bar shows "GPT-4"
- [ ] Copied contents of CHATGPT_INITIAL_PROMPT.txt
- [ ] Pasted into Cursor chat and sent
- [ ] ChatGPT confirmed it understood the project

Once all boxes are checked, you're ready to continue development with ChatGPT!
