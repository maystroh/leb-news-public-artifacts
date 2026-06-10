Create the Radar Beirut analysis pack for 2026-06-03.

Work only inside this briefing folder.

WSL / terminal path:
/mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-03

Project-relative path:
briefings/2026-06-03

Windows reference path:
C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\briefings\2026-06-03

If running under WSL Codex CLI, use the WSL / terminal path or the project-relative path. Do not use Windows backslash paths for shell commands.

Source briefing text:
- briefings/2026-06-03/briefing_2026-06-03_corrected.txt
- when both AI-generated and human-corrected briefing text files exist, always use the `_corrected.txt` source as the editorial source of truth

Fill only these JSON files.

Use these project-relative paths for apply_patch and shell commands run from the repo root:
- briefings/2026-06-03/visual-script.json
- briefings/2026-06-03/outlet-map.json
- briefings/2026-06-03/quote-duel.json
- briefings/2026-06-03/fault-line-map-script.json
- briefings/2026-06-03/keyword-radar-script.json

If you need absolute WSL terminal paths, use these:
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-03/visual-script.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-03/outlet-map.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-03/quote-duel.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-03/fault-line-map-script.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-03/keyword-radar-script.json

Do not patch or create bare filenames at the repo root such as `visual-script.json`; always include the briefing folder path.

Rules:
- for analysis, preserve every source paragraph in visual-script.json under `scenes` and give each paragraph a headline, summary, and quote
- visual-script.json must also include top-level `outroQuestion`, extracted from the final paragraph as one question only
- `outroQuestion` must not include setup phrases, follow-up sentences, sign-offs, or anything after the question mark
- example: from `والسؤال الذي تتجنبه كل الصحف: ماذا عن الجنوب الذي يبدو خارج أي تهدئة شاملة في كل السيناريوهات؟ هذا ما ستكشفه الساعات القادمة. حتى نلتقي.` extract only `ماذا عن الجنوب الذي يبدو خارج أي تهدئة شاملة في كل السيناريوهات؟`
- for final full-editorial rendering, do not treat every source paragraph as a rendered scene
- scene 1 is framing, the penultimate paragraph is synthesis, and the final paragraph is the open-question outro, so outlet-map.json normally starts at scene-2 and excludes non-outlet scenes
- for the final `radar-beirut-briefing.html` review flow, do not keep the opening paragraph as a standalone rendered scene
- instead, play all outlet scenes first, then one shared closing scene called `خلاصة المشهد`, then the open-question outro
- that shared closing scene should use the final synthesis visual treatment, but its body should merge the first paragraph with the penultimate summary paragraph
- the final paragraph remains the open-question outro and should not be duplicated inside the shared closing scene
- the rendered outro must show only visual-script.json `outroQuestion`, not the full final paragraph
- the build creates or reuses generated `output/timing-config.json`, and that file is the manual source of truth for intro, scene, synthesis, and outro durations after generation
- in outlet scenes, the orange label beside the logo should use the scene thesis/headline, not the outlet name
- if any outlet media exists inside this date folder, front page or article screenshots, use it in the outlet image area instead of text filler
- if an outlet has multiple article screenshots in the date folder, use them as an ordered image sequence in the outlet content area and rotate through them during that outlet scene
- this multi-image content behavior is especially expected for asas-media and almodon when screenshots are available
- if no outlet media exists for that outlet, use a short excerpt fallback and do not label it `من النص`
- do not show the old attached quote box below the outlet image area
- the outlet image area should be tall and should fill the remaining card space under the summary
- the outlet image area should fit inside the main outlet card, and front pages may pan vertically inside that box so the viewer sees the page over time instead of forcing the whole cover into one static crop
- if a front page is smaller than the image box, scale it up to cover the whole box before any pan starts
- article screenshot sequences should fit cleanly inside the outlet image box in contained mode rather than being cropped like full newspaper front pages
- once `output/timing-config.json` exists, the generated HTML should follow those duration values directly instead of using hardcoded scene timing maps
- default outlet timing can start in the 15000ms to 20000ms range, but final timing should be adjustable through `output/timing-config.json`
- use only outlets from the allowed outlet list below
- Quote Duel: pick the strongest 2-4 clashes, each scene = one event + two opposed outlets + two direct quotes + one contrast line
- Fault Line Map: create one fresh day-specific axis, not a permanent one
- Keyword Radar: 3-4 charged terms per outlet scene, ordered by rhetorical force
- keep Arabic concise, sharp, editorial, and readable for vertical video
- use short direct phrases from the source text whenever possible for quote fields
- fault line positions must be between 0 and 1
- keyword radar cluster positions must be between 0 and 1

After the user validates the JSON files, the guided workflow will run this command from the project root:
npm run briefing:build:folder -- --folder briefings/2026-06-03
After the first build, edit `output/timing-config.json` if needed and rerun the same build command to apply your manual timings.

Allowed outlets:
[
  {
    "outletKey": "aawsat",
    "outletName": "الشرق الأوسط",
    "logoFile": "aawsat-logo.png",
    "imagePrefixes": [
      "aawsat",
      "asharqalawsat"
    ]
  },
  {
    "outletKey": "nidaa-al-watan",
    "outletName": "نداء الوطن",
    "logoFile": "nidaalwatan-logo.png",
    "imagePrefixes": [
      "nidaalwatan",
      "nidaaalwatan",
      "nidaa-al-watan"
    ]
  },
  {
    "outletKey": "asas-media",
    "outletName": "أساس ميديا",
    "logoFile": "asasmedia-logo.png",
    "imagePrefixes": [
      "asasmedia",
      "asas-media"
    ]
  },
  {
    "outletKey": "aliwaa",
    "outletName": "اللواء",
    "logoFile": "aliwa2-logo.png",
    "imagePrefixes": [
      "aliwaa",
      "aliwaa2"
    ]
  },
  {
    "outletKey": "aljoumhouria",
    "outletName": "الجمهورية",
    "logoFile": "aljoumhouria-logo.png",
    "imagePrefixes": [
      "aljoumhouria",
      "joumhouria"
    ]
  },
  {
    "outletKey": "almodon",
    "outletName": "المدن",
    "logoFile": "almodon-logo.png",
    "imagePrefixes": [
      "almodon",
      "modon"
    ]
  },
  {
    "outletKey": "alakhbar",
    "outletName": "الأخبار",
    "logoFile": "alakhbar-logo.png",
    "imagePrefixes": [
      "alakhbar",
      "akhbar"
    ]
  },
  {
    "outletKey": "aldiyar",
    "outletName": "الديار",
    "logoFile": "aldiyar-logo.png",
    "imagePrefixes": [
      "aldiyar",
      "addiyar",
      "diyar"
    ]
  },
  {
    "outletKey": "albinaa",
    "outletName": "البناء",
    "logoFile": "albina2-logo.png",
    "imagePrefixes": [
      "albinaa",
      "albina2",
      "binaa"
    ]
  },
  {
    "outletKey": "180post",
    "outletName": "180 بوست",
    "logoFile": "180post-logo.png",
    "imagePrefixes": [
      "180post"
    ]
  }
]

Paragraphs by scene id:
[
  {
    "sceneId": "scene-1",
    "paragraph": "صباح الأربعاء. الثالث من حزيران. الصحف اليوم تجلس كلها على مقعد واحد: مقعد المفاوضات في واشنطن، الجولة الرابعة من ملف شائك يحمل في طيّاته مصير لبنان وسلاحه وعلاقته بإيران. والرجل الذي تتقاطع عنده كل الخطوط، يُمدَح وينتقَد في الوقت ذاته، هو دونالد ترامب. المزاج العام مشوب بالترقب والحذر القاسي: وقف النار - هل هو شامل أم \"مجتزأ\"؟ إيران - هل تُسند أم تتفاوض على حساب الحزب؟ والدولة اللبنانية - هل تقود التفاوض أم تُلحَق به؟"
  },
  {
    "sceneId": "scene-2",
    "paragraph": "أبدأ اليوم من الشرق الأوسط، الصحيفة السعودية التي تتابع المشهد من زاوية الرياض. عنوانها الكبير: \"ترمب يفرض إرادته - لجم نتنياهو وأنقذ بيروت من القصف.\" هذا الإطار يُقدّم الرئيس الأمريكي كقوة ضبط لا يمكن الاستغناء عنها، بينما يرسم نتنياهو في صورة المجنون المتغطرس الذي يحتاج إلى من يُكبح جماحه. الشرق الأوسط تُفرد مساحة واسعة لما تسميه \"تأميم مضيق هرمز\" - الورقة الإيرانية الجديدة التي تربط أمن لبنان بأمن الطاقة العالمي. وفي المقابل، الصحيفة ترى في الدور الإيراني محاولةً لـ\"مسابقة الدولة اللبنانية\" على انتزاع الفضل في التهدئة، وتُبرز الموقف السعودي الحازم الذي جاء في بيان شديد اللهجة."
  },
  {
    "sceneId": "scene-3",
    "paragraph": "ننتقل إلى الأخبار، صاحبة العنوان الأكثر دراماتيكية اليوم: \"تصميم إيراني على إسناد لبنان - طهران تودّع زمن الصبر.\" هذا ليس مجرد عنوان، بل إعلان استراتيجي يقول إن مرحلة الانتظار انتهت وبدأت مرحلة الإسناد المباشر من طهران. الصحيفة تُصوّر إسرائيل كياناً ينهار في مستوطناته الشمالية تحت ضغط مسيّرات المقاومة، وتُقدّم \"فيتو\" ترامب على قصف بيروت كمؤشر على تراجع استراتيجي إسرائيلي لا كفضل أمريكي. المفارقة التي لا تخطئها العين: الأخبار تنتقد اليوم السلطة اللبنانية لإهمالها ملف الامتحانات الجامعية ووفاة طالبة - كأن جبهة الداخل وجبهة المقاومة تسيران في صفحة واحدة."
  },
  {
    "sceneId": "scene-4",
    "paragraph": "وفي فريق الخطاب السيادي، نداء الوطن تُعلن المعركة بأعلى صوتها: \"مسار واشنطن يتقدم وصفقة الضاحية تربك الميليشيا.\" الصحيفة لا تكتفي بنزع الشرعية عن سلاح حزب الله، بل تشنّ هجوماً دستورياً مبكّراً على نبيه بري، تطالب بنقل ملف التفاوض كلياً إلى رئاسة الجمهورية. الخطاب اليوم في نداء الوطن أشدّ حدةً مما عوّدتنا عليه: استعارات ساخرة تحقّر القوة العسكرية للحزب، ومطالبة بتدريب أمريكي للجيش اللبناني لمواجهة نفوذ الحزب من الداخل، وتصوير الطائفة الشيعية ضحيةً للمشروع الإيراني في ما تُسميه \"نكبة شيعية\" قادمة. هذا تصعيد غير مسبوق في أسلوب الصحيفة."
  },
  {
    "sceneId": "scene-5",
    "paragraph": "وتُكمل الجمهورية الصورة بطرح مختلف النبرة: \"ساعات حاسمة بين وقف نار شامل أو مجتزأ.\" الجمهورية تكشف عبر مصادرها الدبلوماسية أن الاتفاق المطروح \"مبتور\" - يُحيّد الضاحية مقابل تهدئة حدودية مع المستوطنات الشمالية الإسرائيلية، لكنه يترك الجنوب ساحة مفتوحة. وتُصعّد الجمهورية في سقف مطالبها إلى حدّ لم تبلغه من قبل: المطالبة بتفكيك البنى المالية والإدارية لحزب الله، لا مجرد الانسحاب العسكري، وهو رفع لسقف التفاوض جوهري يستحق الانتباه."
  },
  {
    "sceneId": "scene-6",
    "paragraph": "أساس ميديا تُقدّم اليوم مفاجأة تحريرية: \"الاتفاق الأمريكي-الإيراني لحظة تاريخية لخلاص دولة لبنان.\" السطر الأبرز هنا هو التحوّل في موقف الصحيفة من ترامب - من التشكيك في \"صفقاته الهشة\" إلى الترحيب بها كـ\"مرجعية إجماع وطني.\" الصحيفة تستخدم اليوم مصطلح \"الجلافة السيادية\" - تطالب الدولة بممارسة سلطتها بحزم دون تحفظ ودون دبلوماسية ناعمة. وتُبرز صوراً لمثقفين من الجنوب والبيئة الشيعية يرفضون السلاح علناً، في رسالة مدروسة عن تآكل الحاضنة الشعبية للحزب."
  },
  {
    "sceneId": "scene-7",
    "paragraph": "المدن تُقدّم اليوم أكثر الجمل صدمةً في المشهد الصحفي: \"ترامب منح حزب الله شرعية انتزعها بالتعب والعرق والصبر.\" الصحيفة الرقابية ترصد مأزقاً مؤسسياً عميقاً: الدولة اللبنانية التي وصفت تاريخياً الحزب بالعصابة اضطرت إلى التفاوض معه، فـ\"كانت الخاسر الأكبر حفاظاً لماء الوجه.\" وتُنبّه المدن إلى تحوّل دقيق في لغة المفاوضات: بدلاً من \"نزع السلاح\" الصدامي، تحوّل الجميع تقريباً إلى لغة \"الاحتواء\" ضمن تسوية إقليمية تشارك فيها إيران نفسها."
  },
  {
    "sceneId": "scene-8",
    "paragraph": "واللواء السنية التقليدية - وهنا ما يستحق التوقف الطويل - تخرج اليوم عن إطارها المعتدل المعهود. الصحيفة التي عُرفت بصوت الوسطية السنية تُعيد تأهيل أحمد الأسير وتسأل علناً: \"هل كان صاحب رؤية إنقاذية مبكرة للجنوب والشيعة؟\" وتنزع في سياق آخر عن ذكرى الخامس والعشرين من أيار صفة التحرير، وتصف مشروع الممانعة بـ\"السقوط المدوي.\" هذا التحوّل في اللواء - الذي يبدو أقرب إلى قطيعة سردية مع مرحلة كاملة - مؤشر على أن الهزة السياسية لهذه المرحلة تمتد إلى أعماق الوسط السني التقليدي."
  },
  {
    "sceneId": "scene-9",
    "paragraph": "وأختم بالبناء التي تفتح الأفق الأوسع اليوم: معادلات ردع جديدة تفرضها المقاومة وإيران على طريق \"النصر الاستراتيجي\"، والتهديد ببنود هرمز وباب المندب بات \"جاهزية لوجستية\" لا مجرد شعار. وتُبرز الصحيفة \"القمة الروحية\" كغطاء ديني ووطني جامع يُشرعن خيار المقاومة في وجه الانقسام الداخلي."
  },
  {
    "sceneId": "scene-10",
    "paragraph": "أما الديار، فتعيش بمزاجها البراغماتي المعهود في قلب التناقضات: تُشرعن معادلة الردع الميدانية، وتطالب في الوقت ذاته بـ\"حصر السلاح\" ضمن استراتيجية دفاعية وطنية. والأبرز في الديار اليوم ملف لم تُعطه الصحف الأخرى حقه: إسرائيل تستهدف قلعة الشقيف وأسوار صور وآثار بعلبك، وهذا في عرف الصحيفة ليس حرباً عسكرية فحسب، بل حرب على الهوية والذاكرة الجماعية اللبنانية."
  },
  {
    "sceneId": "scene-11",
    "paragraph": "وخلاصة اليوم؟ الصحف تتفق على مسرح واحد - واشنطن - وعلى محرّك واحد للحظة - ترامب. لكنها تختلف جوهرياً على المعنى: هل ما يجري اعتراف أمريكي بقوة المقاومة وإسناد إيراني يفرض الشروط، كما يقول إعلام المحور؟ أم انهيار الحزب وفرصة تاريخية لاستعادة الدولة، كما يُصرّ فريق الخطاب السيادي؟"
  },
  {
    "sceneId": "scene-12",
    "paragraph": "والسؤال الذي تتجنبه كل الصحف: ماذا عن الجنوب الذي يبدو خارج أي تهدئة شاملة في كل السيناريوهات؟ هذا ما ستكشفه الساعات القادمة. حتى نلتقي."
  }
]

Full briefing text:
صباح الأربعاء. الثالث من حزيران. الصحف اليوم تجلس كلها على مقعد واحد: مقعد المفاوضات في واشنطن، الجولة الرابعة من ملف شائك يحمل في طيّاته مصير لبنان وسلاحه وعلاقته بإيران. والرجل الذي تتقاطع عنده كل الخطوط، يُمدَح وينتقَد في الوقت ذاته، هو دونالد ترامب. المزاج العام مشوب بالترقب والحذر القاسي: وقف النار - هل هو شامل أم "مجتزأ"؟ إيران - هل تُسند أم تتفاوض على حساب الحزب؟ والدولة اللبنانية - هل تقود التفاوض أم تُلحَق به؟

أبدأ اليوم من الشرق الأوسط، الصحيفة السعودية التي تتابع المشهد من زاوية الرياض. عنوانها الكبير: "ترمب يفرض إرادته - لجم نتنياهو وأنقذ بيروت من القصف." هذا الإطار يُقدّم الرئيس الأمريكي كقوة ضبط لا يمكن الاستغناء عنها، بينما يرسم نتنياهو في صورة المجنون المتغطرس الذي يحتاج إلى من يُكبح جماحه. الشرق الأوسط تُفرد مساحة واسعة لما تسميه "تأميم مضيق هرمز" - الورقة الإيرانية الجديدة التي تربط أمن لبنان بأمن الطاقة العالمي. وفي المقابل، الصحيفة ترى في الدور الإيراني محاولةً لـ"مسابقة الدولة اللبنانية" على انتزاع الفضل في التهدئة، وتُبرز الموقف السعودي الحازم الذي جاء في بيان شديد اللهجة.

ننتقل إلى الأخبار، صاحبة العنوان الأكثر دراماتيكية اليوم: "تصميم إيراني على إسناد لبنان - طهران تودّع زمن الصبر." هذا ليس مجرد عنوان، بل إعلان استراتيجي يقول إن مرحلة الانتظار انتهت وبدأت مرحلة الإسناد المباشر من طهران. الصحيفة تُصوّر إسرائيل كياناً ينهار في مستوطناته الشمالية تحت ضغط مسيّرات المقاومة، وتُقدّم "فيتو" ترامب على قصف بيروت كمؤشر على تراجع استراتيجي إسرائيلي لا كفضل أمريكي. المفارقة التي لا تخطئها العين: الأخبار تنتقد اليوم السلطة اللبنانية لإهمالها ملف الامتحانات الجامعية ووفاة طالبة - كأن جبهة الداخل وجبهة المقاومة تسيران في صفحة واحدة.

وفي فريق الخطاب السيادي، نداء الوطن تُعلن المعركة بأعلى صوتها: "مسار واشنطن يتقدم وصفقة الضاحية تربك الميليشيا." الصحيفة لا تكتفي بنزع الشرعية عن سلاح حزب الله، بل تشنّ هجوماً دستورياً مبكّراً على نبيه بري، تطالب بنقل ملف التفاوض كلياً إلى رئاسة الجمهورية. الخطاب اليوم في نداء الوطن أشدّ حدةً مما عوّدتنا عليه: استعارات ساخرة تحقّر القوة العسكرية للحزب، ومطالبة بتدريب أمريكي للجيش اللبناني لمواجهة نفوذ الحزب من الداخل، وتصوير الطائفة الشيعية ضحيةً للمشروع الإيراني في ما تُسميه "نكبة شيعية" قادمة. هذا تصعيد غير مسبوق في أسلوب الصحيفة.

وتُكمل الجمهورية الصورة بطرح مختلف النبرة: "ساعات حاسمة بين وقف نار شامل أو مجتزأ." الجمهورية تكشف عبر مصادرها الدبلوماسية أن الاتفاق المطروح "مبتور" - يُحيّد الضاحية مقابل تهدئة حدودية مع المستوطنات الشمالية الإسرائيلية، لكنه يترك الجنوب ساحة مفتوحة. وتُصعّد الجمهورية في سقف مطالبها إلى حدّ لم تبلغه من قبل: المطالبة بتفكيك البنى المالية والإدارية لحزب الله، لا مجرد الانسحاب العسكري، وهو رفع لسقف التفاوض جوهري يستحق الانتباه.

أساس ميديا تُقدّم اليوم مفاجأة تحريرية: "الاتفاق الأمريكي-الإيراني لحظة تاريخية لخلاص دولة لبنان." السطر الأبرز هنا هو التحوّل في موقف الصحيفة من ترامب - من التشكيك في "صفقاته الهشة" إلى الترحيب بها كـ"مرجعية إجماع وطني." الصحيفة تستخدم اليوم مصطلح "الجلافة السيادية" - تطالب الدولة بممارسة سلطتها بحزم دون تحفظ ودون دبلوماسية ناعمة. وتُبرز صوراً لمثقفين من الجنوب والبيئة الشيعية يرفضون السلاح علناً، في رسالة مدروسة عن تآكل الحاضنة الشعبية للحزب.

المدن تُقدّم اليوم أكثر الجمل صدمةً في المشهد الصحفي: "ترامب منح حزب الله شرعية انتزعها بالتعب والعرق والصبر." الصحيفة الرقابية ترصد مأزقاً مؤسسياً عميقاً: الدولة اللبنانية التي وصفت تاريخياً الحزب بالعصابة اضطرت إلى التفاوض معه، فـ"كانت الخاسر الأكبر حفاظاً لماء الوجه." وتُنبّه المدن إلى تحوّل دقيق في لغة المفاوضات: بدلاً من "نزع السلاح" الصدامي، تحوّل الجميع تقريباً إلى لغة "الاحتواء" ضمن تسوية إقليمية تشارك فيها إيران نفسها.

واللواء السنية التقليدية - وهنا ما يستحق التوقف الطويل - تخرج اليوم عن إطارها المعتدل المعهود. الصحيفة التي عُرفت بصوت الوسطية السنية تُعيد تأهيل أحمد الأسير وتسأل علناً: "هل كان صاحب رؤية إنقاذية مبكرة للجنوب والشيعة؟" وتنزع في سياق آخر عن ذكرى الخامس والعشرين من أيار صفة التحرير، وتصف مشروع الممانعة بـ"السقوط المدوي." هذا التحوّل في اللواء - الذي يبدو أقرب إلى قطيعة سردية مع مرحلة كاملة - مؤشر على أن الهزة السياسية لهذه المرحلة تمتد إلى أعماق الوسط السني التقليدي.

وأختم بالبناء التي تفتح الأفق الأوسع اليوم: معادلات ردع جديدة تفرضها المقاومة وإيران على طريق "النصر الاستراتيجي"، والتهديد ببنود هرمز وباب المندب بات "جاهزية لوجستية" لا مجرد شعار. وتُبرز الصحيفة "القمة الروحية" كغطاء ديني ووطني جامع يُشرعن خيار المقاومة في وجه الانقسام الداخلي.

 أما الديار، فتعيش بمزاجها البراغماتي المعهود في قلب التناقضات: تُشرعن معادلة الردع الميدانية، وتطالب في الوقت ذاته بـ"حصر السلاح" ضمن استراتيجية دفاعية وطنية. والأبرز في الديار اليوم ملف لم تُعطه الصحف الأخرى حقه: إسرائيل تستهدف قلعة الشقيف وأسوار صور وآثار بعلبك، وهذا في عرف الصحيفة ليس حرباً عسكرية فحسب، بل حرب على الهوية والذاكرة الجماعية اللبنانية.

وخلاصة اليوم؟ الصحف تتفق على مسرح واحد - واشنطن - وعلى محرّك واحد للحظة - ترامب. لكنها تختلف جوهرياً على المعنى: هل ما يجري اعتراف أمريكي بقوة المقاومة وإسناد إيراني يفرض الشروط، كما يقول إعلام المحور؟ أم انهيار الحزب وفرصة تاريخية لاستعادة الدولة، كما يُصرّ فريق الخطاب السيادي؟ 

والسؤال الذي تتجنبه كل الصحف: ماذا عن الجنوب الذي يبدو خارج أي تهدئة شاملة في كل السيناريوهات؟ هذا ما ستكشفه الساعات القادمة. حتى نلتقي.