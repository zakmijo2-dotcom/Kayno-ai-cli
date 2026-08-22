# ⚡ NOVA — دليل سريع (عربي)

أداة CLI للذكاء الاصطناعي **بدون أي اعتماديات** (Node.js ≥ 18) تدعم:

- **أكثر من 60 مزوّد جاهز** (وبعد المزامنة من models.dev أكثر من 200): OpenAI, Claude, Gemini, DeepSeek, Qwen, Groq, OpenRouter, Kimi, GLM, Ollama وغيرها.
- **OAuth**: 
  - `nova auth login google` — نفس آلية Gemini CLI عبر Code Assist.
  - `nova auth login antigravity` — دخول Antigravity، أو استيراد التوكنات: `nova auth import antigravity --access T --refresh T`.
- **أدوات وكيل**: قراءة/كتابة ملفات، تنفيذ أوامر مع تأكيد، جلب روابط — مع حلقات استدعاء أدوات متعددة الخطوات.
- **نظام Skills**: ملفات `SKILL.md` في `~/.nova/skills` تتفعّل تلقائياً حسب كلمات التشغيل.
- **نظام Plugins/Extensions**: ضع ملف JS في `~/.nova/plugins` يسجّل أوامر `/slash` وhooks.

## تشغيل سريع

```bash
cd /root/nova && npm link

nova chat -p antigravity -m gemini-3-pro-preview      # بعد nova auth login antigravity
nova chat -p google-code-assist -m gemini-2.5-pro     # OAuth مثل Gemini CLI
nova ask -p deepseek -m deepseek-chat "اشرح هذا الكود"
nova providers sync                                    # +200 مزود إضافي
```

الإعدادات في `~/.nova/config.json` والمفاتيح عبر `nova auth set-key <provider> <key>` أو متغيرات البيئة.

## الاختبارات

```bash
npm test   # يفحص المهارات، الإضافات، الكتالوج، وحلقة استدعاء الأدوات عبر خادم SSE محلي
```
