<div align="center">

# ⚡ Nova — دليل عربي

**وكيل برمجي بالذكاء الاصطناعي للطرفية — بدون أي اعتماديات.**

· [النسخة الإنجليزية الكاملة](README.md)

</div>

---

Nova (أمر التشغيل: **`nova`**) وكيل برمجي احترافي يعمل داخل الطرفية: واجهة TUI سريعة، حلقات أدوات ذكية، حماية Sandbox للمشروع، ومحرك صلاحيات — كله بمشروع Node.js نقي **بدون ولا dependency واحدة**، مصمم أساسًا لـ Termux والأجهزة الضعيفة.

## التثبيت

```bash
curl -fsSL https://raw.githubusercontent.com/zakmijo2-dotcom/Kayno-ai-cli/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

لـ Termux: `pkg install nodejs` ثم نفس الأمر أعلاه.

## البدء السريع

```bash
nova auth set-key openrouter sk-or-...   # أو متغير البيئة
nova                                     # يشغّل الواجهة التفاعلية
```

داخل الواجهة:
- `/provider` و `/model` — قوائم اختيار تفاعلية مع حالة الجاهزية
- `/git` — فرع/تغييرات/سجل بدون مغادرة المحادثة
- `/sessions` — استعراض واستئناف الجلسات المحفوظة

مزودون آخرون:

```bash
nova auth login google                    # OAuth مثل Gemini CLI
nova auth login antigravity               # خلفية Antigravity
nova chat -p ollama -m llama3.2           # محلي بالكامل
```

## الأوضاع الثلاثة

| الأمر | السلوك |
|---|---|
| `nova` | الواجهة التفاعلية TUI |
| `NOVA_TUI=0 nova chat` | REPL نصي بسيط للأنابيب |
| `nova ask "سؤال"` | إخراج نصي صافٍ بدون ANSI، يقرأ stdin |

```bash
cat server.js | nova ask -p deepseek -m deepseek-chat "راجع هذا"
```

## نظام الأدوات + الصلاحيات

11 أداة: `read_file` `write_file` `edit_file` `patch_file` `grep` `glob` `list_dir` `run_command` `fetch_url` `git_status` `git_diff`

- كل مسار محصور داخل جذر المشروع (Sandbox) — أي محاولة خروج تُرفض
- سياسات مستقلة لكل فئة:

```jsonc
{
  "permissions": {
    "read": "allow", "write": "ask", "shell": "ask",
    "network": "allow", "git": "allow"
  }
}
```

في الواجهة التفاعلية تظهر بطاقة تأكيد `[y/N]`؛ وفي السكربتات يفشل الطلب برسالة واضحة بدلاً من التعليق.

## اختصارات المفاتيح

| مفتاح | وظيفة |
|---|---|
| `Enter` / `Ctrl+J` | إرسال / سطر جديد |
| `/` | قائمة الأوامر (اكتب للتصفية، Tab للإكمال) |
| `↑ ↓` | تنقل بالسجل |
| `Ctrl+C` | إلغاء الجاري — اضغط مرتين للخروج |
| `Ctrl+L` / `Ctrl+U` | تنظيف الشاشة / السطر |

## أوامر CLI

```bash
nova doctor                    # فحص البيئة والمفاتيح والكاش
nova git status|diff|log       # عرض Git السريع
nova providers sync            # +200 مزود من models.dev
nova sessions search "<نص>"    # بحث في الجلسات
```

## أدوات الوكيل المتقدمة

```bash
/compact      # تلخيص المحادثات القديمة وتفريغ السياق
/undo /redo   # تراجع/إعادة عن تعديلات الوكيل (checkpoints)
/tokens /cost # استهلاك التوكنات والتكلفة التقديرية
/diff         # تغييرات git بدون مغادرة المحادثة
/export       # تصدير المحادثة markdown
/mcp          # ربط خوادم MCP من ~/.config/nova/mcp.json
```

- **إصلاح ذاتي**: بعد كل تعديل ملف يشغّل الفحوصات المتاحة (`node --check`, `tsc`) ويصلح الأخطاء تلقائيًا (بحد 3 محاولات).
- **قواعد المشروع**: `AGENT.md` → `SKILL.md` → `.nova/skills/*.md` تُكتشف وتُحقن بالأولوية.
- **صور**: أرفق بـ `@image.png` داخل رسالتك (يتطلب موديل يدعم vision).

## الاختبارات

```bash
npm test   # 6 مجموعات، أكثر من 100 تحقق بما فيها E2E
```

## الأمان

- إخفاء تلقائي للأسرار من كل السجلات (`sk-…`, `ghp_…`, Bearer)
- توكنات OAuth في `~/.nova/auth.json` فقط
- توسيع الـSandbox يكون مقصودًا عبر `workspace.extraRoots`

الترخيص: [MIT](LICENSE) — النسخة الإنجليزية الكاملة: [README.md](README.md)
