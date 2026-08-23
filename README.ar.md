# Kayno (أمر التشغيل: mij) — دليل سريع (عربي)

أداة CLI للذكاء الاصطناعي **بدون أي اعتماديات** (Node.js ≥ 18) تدعم:

- **أكثر من 60 مزوّد جاهز** (وبعد المزامنة من models.dev أكثر من 200): OpenAI, Claude, Gemini, DeepSeek, Qwen, Groq, OpenRouter, Kimi, GLM, Ollama وغيرها.
- **OAuth**: 
  - `mij auth login google` — نفس آلية Gemini CLI عبر Code Assist.
  - `mij auth login antigravity` — دخول Antigravity، أو استيراد التوكنات: `mij auth import antigravity --access T --refresh T`.
- **واجهة TUI احترافية وخفيفة**: بث مباشر للردود، شريط حالة، بطاقات أدوات، قوائم اختيار للموديل/المزود/الجلسات — بدون أي مكتبات UI، مناسبة لـ Termux والأجهزة الضعيفة.
- **نظام أدوات كامل لوكيل برمجي**: read_file/write_file/edit_file/patch_file/grep/glob/list_dir/run_command/fetch_url/git_status/git_diff — كلها داخل Sandbox يمنع الخروج من المشروع، مع محرك صلاحيات (allow/ask/deny لكل فئة: قراءة/كتابة/تنفيذ/شبكة/git).
- **إدارة سياق ذكية**: حدود سياق لكل موديل، تقدير التوكنات، تشذيب المحادثة القديمة مع الحفاظ على تكامل استدعاءات الأدوات.
- **ذكاء Git والمشروع**: فرع الحالة في شريط المعلومات، كشف اللغة ومدير الحزم وأمر الاختبارات تلقائيًا.
- **تشخيصات**: `mij doctor` لفحص البيئة والمفاتيح والكاش.
- **نظام Skills**: ملفات `SKILL.md` في `~/.nova/skills` تتفعّل تلقائياً حسب كلمات التشغيل.
- **نظام Plugins/Extensions**: ضع ملف JS في `~/.nova/plugins` يسجّل أوامر `/slash` وhooks.

## تشغيل سريع

```bash
curl -fsSL https://raw.githubusercontent.com/zakmijo2-dotcom/Kayno-ai-cli/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

cd /root/nova && npm link   # أو من نسخة محلية

mij                                     # يشغّل الواجهة التفاعلية TUI
mij auth set-key openrouter sk-or-...
# داخل الواجهة: /provider و/model و/sessions قوائم تفاعلية

mij chat -p antigravity -m gemini-3-pro-preview      # بعد mij auth login antigravity
mij chat -p google-code-assist -m gemini-2.5-pro     # OAuth مثل Gemini CLI
cat file.py | mij ask -p deepseek -m deepseek-chat "راجع هذا"   # نص صافي بدون ANSI
KAYNO_TUI=0 mij chat                                  # REPL كلاسيكي للأنابيب

## اختصارات لوحة المفاتيح
| مفتاح | وظيفة |
|---|---|
| Enter | إرسال |
| Ctrl+J | سطر جديد |
| ↑/↓ | تنقل بالسجل |
| Tab | إكمال الأوامر |
| / | فتح قائمة الأوامر (اكتب للتصفية) |
| Ctrl+C | إلغاء الرد الجاري / خروج |
| Ctrl+L | تنظيف الشاشة |
| Ctrl+U | مسح السطر |

mij providers sync                     # +200 مزود إضافي
```

الإعدادات في `~/.nova/config.json` والمفاتيح عبر `mij auth set-key <provider> <key>` أو متغيرات البيئة.

## الاختبارات

```bash
npm test   # يفحص المهارات، الإضافات، الكتالوج، وحلقة استدعاء الأدوات عبر خادم SSE محلي
```
