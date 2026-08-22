# ⚡ NOVA — دليل سريع (عربي)

أداة CLI للذكاء الاصطناعي **بدون أي اعتماديات** (Node.js ≥ 18) تدعم:

- **أكثر من 60 مزوّد جاهز** (وبعد المزامنة من models.dev أكثر من 200): OpenAI, Claude, Gemini, DeepSeek, Qwen, Groq, OpenRouter, Kimi, GLM, Ollama وغيرها.
- **OAuth**: 
  - `mij auth login google` — نفس آلية Gemini CLI عبر Code Assist.
  - `mij auth login antigravity` — دخول Antigravity، أو استيراد التوكنات: `mij auth import antigravity --access T --refresh T`.
- **أدوات وكيل**: قراءة/كتابة ملفات، تنفيذ أوامر مع تأكيد، جلب روابط — مع حلقات استدعاء أدوات متعددة الخطوات.
- **نظام Skills**: ملفات `SKILL.md` في `~/.nova/skills` تتفعّل تلقائياً حسب كلمات التشغيل.
- **نظام Plugins/Extensions**: ضع ملف JS في `~/.nova/plugins` يسجّل أوامر `/slash` وhooks.

## تشغيل سريع

```bash
curl -fsSL https://raw.githubusercontent.com/zakmijo2-dotcom/Kayno-ai-cli/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

cd /root/nova && npm link   # أو من نسخة محلية

mij auth set-key openrouter sk-or-...
mij chat -p antigravity -m gemini-3-pro-preview      # بعد mij auth login antigravity
mij chat -p google-code-assist -m gemini-2.5-pro     # OAuth مثل Gemini CLI
mij ask -p deepseek -m deepseek-chat "اشرح هذا الكود"
mij providers sync                                    # +200 مزود إضافي
```

الإعدادات في `~/.nova/config.json` والمفاتيح عبر `mij auth set-key <provider> <key>` أو متغيرات البيئة.

## الاختبارات

```bash
npm test   # يفحص المهارات، الإضافات، الكتالوج، وحلقة استدعاء الأدوات عبر خادم SSE محلي
```
