Create the Radar Beirut analysis pack for 2026-06-09.

Work only inside this briefing folder.

WSL / terminal path:
/mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-09

Project-relative path:
briefings/2026-06-09

Windows reference path:
C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\briefings\2026-06-09

If running under WSL Codex CLI, use the WSL / terminal path or the project-relative path. Do not use Windows backslash paths for shell commands.

Source briefing text:
- briefings/2026-06-09/briefing_2026-06-09_corrected.txt
- when both AI-generated and human-corrected briefing text files exist, always use the `_corrected.txt` source as the editorial source of truth

Fill only these JSON files.

Use these project-relative paths for apply_patch and shell commands run from the repo root:
- briefings/2026-06-09/visual-script.json
- briefings/2026-06-09/outlet-map.json
- briefings/2026-06-09/quote-duel.json
- briefings/2026-06-09/fault-line-map-script.json
- briefings/2026-06-09/keyword-radar-script.json

If you need absolute WSL terminal paths, use these:
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-09/visual-script.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-09/outlet-map.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-09/quote-duel.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-09/fault-line-map-script.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-09/keyword-radar-script.json

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
- in outlet scenes, `visual.summary` must state the editorial position directly and must not repeat the outlet name or begin with formulas such as `المدن ترى`, `الأخبار تقول`, `الجمهورية تعتبر`, or `ترى الصحيفة` because outlet identity is already rendered separately
- example: write `التسوية لا تولد في واشنطن وحدها، والجنوب دخل إدارة توتر طويلة لا سلاماً قريباً.` instead of `المدن ترى أن التسوية لا تولد في واشنطن وحدها، وأن الجنوب دخل إدارة توتر طويلة لا سلاماً قريباً.`
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
npm run briefing:build:folder -- --folder briefings/2026-06-09
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
    "paragraph": "الاثنين التاسع من يونيو 2026، وبيروت تصحو على مشهد مزدوج: ضربات إيرانية مباشرة نحو إسرائيل، وضربات إسرائيلية متواصلة على الضاحية والجنوب ومدينة صور، في حين يُجري السفير الأمريكي ميشال عيسى جولته على الرؤساء الثلاثة طارحاً مقترح \"المنطقة التجريبية\". الصحف والمواقع اليوم لا تتساءل متى يتوقف القتال فحسب، بل من يملك ورقة لبنان: طهران، أم بيروت؟"
  },
  {
    "sceneId": "scene-2",
    "paragraph": "أبدأ اليوم من صحيفة الجمهورية، التي تصدّرت صفحتها الأولى بعنوان: \"عون يثبّت خيار الدولة وواشنطن تمنع ربط لبنان بالحرب\". ركّزت على تصريحات الرئيس جوزيف عون، متناولةً إعلانه أن لا أحد يفاوض عن لبنان غير الدولة اللبنانية، وأبرزت أن \"زمن المجاملة\" مع حزب الله قد انتهى وعلى لسان مسؤولين رسميين. وصفت صحيفة الجمهورية لبنان بأنه عالق بين \"مطرقة إيران وسندان إسرائيل\"، ورأت في الدور الأمريكي ضمانةً لمنع تحوّل البلاد إلى منصة إلزامية للردّ الإيراني."
  },
  {
    "sceneId": "scene-3",
    "paragraph": "وننتقل إلى نداء الوطن، التي عنونت \"واشنطن تراهن على الدولة وتتجاوز بري والحزب\"، مشهِرةً لغةً أكثر حدةً: وصفت ضمانات نبيه بري بـ\"النكتة\"، وطالبت بتصفية مؤسسة القرض الحسن باعتبارها \"ممر لبنان نحو اللائحة السوداء\"، وطرحت فكرة مقاضاة إيران قضائياً لاسترداد تعويضات عن دمار لبنان من أصولها المجمدة. أحكمت الصحيفة مثلث اتهامها: إيران المحتل، وحزب الله الميليشيا، ونبيه بري الوكيل الفاقد للصلاحية."
  },
  {
    "sceneId": "scene-4",
    "paragraph": "وفي أساس ميديا اليوم، حيث جمع العنوان الجامع مضمون اليوم: \"تفكيك الدويلة العميقة: من مطار القليعات إلى فك الارتباط مع طهران\". كتب زياد عيتاني متناولاً افتتاح مطار رينيه معوض في القليعات بوصفه لحظةً سيادية رمزية، مستعرضاً تاريخاً من رفض حزب الله لهذا الملف منذ 2009. وكتب وليد شقير في الموقع ذاته عن \"هستيريا إيرانية بعد فقدان ورقة لبنان\"، مسمّياً الرد الصاروخي الإيراني \"قرارات هوجاء\" نابعةً من فقدان طهران للسيطرة على القرار اللبناني."
  },
  {
    "sceneId": "scene-5",
    "paragraph": "أما في صحيفة الأخبار، التي نشرت مادتها الافتتاحية تحت عنوان \"ضربات إيران: احتواء إسرائيل عبر أمريكا\"، مؤطِّرةً الهجوم الصاروخي الإيراني المباشر لا بوصفه تصعيداً بل \"إمساكاً بزمام المبادرة\". رأت الصحيفة أن إيران استعادت المبادرة الاستراتيجية، وأن أي محاولة لإضعافها هي في جوهرها استهداف للمقاومة في لبنان، مستخدمةً مصطلح \"إيران الجديدة\" للإشارة إلى مرحلة تجاوزت \"الصبر الاستراتيجي\" نحو الفعل المباشر."
  },
  {
    "sceneId": "scene-6",
    "paragraph": "وننتقل إلى موقع المدن، الذي ذهب في الاتجاه التقني الدبلوماسي. كتب منير الربيع متناولاً كواليس تعديل البيان الثلاثي الأمريكي-اللبناني-الإسرائيلي، كاشفاً أن فكرة \"المناطق النموذجية\" كانت في أصلها اقتراحاً من رئيس الوفد اللبناني المفاوض سيمون كرم مستنداً إلى تجربة \"جزين أولاً\" في التسعينيات. وكتبت جاسنت عنتر في الموقع ذاته عن مرونة يبديها الثنائي الشيعي إزاء مصطلح \"تجميد السلاح\" بدلاً من نزعه، بوصفه صيغةً أكثر واقعية قد تحظى بترحيب مصري-سعودي. وحمّل الموقع إسرائيل المسؤولية عن عرقلة المسار الدبلوماسي عبر التصعيد الميداني."
  },
  {
    "sceneId": "scene-7",
    "paragraph": "وننتقل إلى صحيفة اللواء، التي أبرزت \"جولة السفير الأمريكي ميشال عيسى وتثبيت صيغة المنطقة التجريبية في الجنوب\"، طالبةً بفك \"الاستباحة الإيرانية\" وحصر السلاح والتفاوض بيد الدولة والجيش. مالت الصحيفة في تقييمها إلى الفصل بين نبيه بري \"رجل الدولة\" وبين حزب الله \"صاحب الأخطاء الاستراتيجية\"، مستحضِرةً الإرث المؤسسي السني عبر تسليط الضوء على جمعية المقاصد وتاريخها."
  },
  {
    "sceneId": "scene-8",
    "paragraph": "وننتقل إلى صحيفة الشرق الأوسط، التي أطلقت عنوان \"ترامب يلجم التصعيد الإقليمي ويفرض معادلات أمنية جديدة في لبنان\". وصفت الصحيفة حزب الله بـ\"الفصيل المهزوم\"، ورصدت ما سمّته \"نكبة الإسناد\" التي حطّمت نظرية الردع الحزبلاهية، واعتبرت دونالد ترامب \"المايسترو\" الوحيد القادر على لجم إسرائيل وفرض الحلول، مطالبةً صراحةً بانتهاء \"الثلاثية الكارثية\"."
  },
  {
    "sceneId": "scene-9",
    "paragraph": "وننتقل إلى صحيفة البناء، التي احتفلت بعنوانها \"إيران تفرض معادلة الشمال مقابل الضاحية وتكسر جمود التفاوض\". وصفت ما جرى بـ\"الانتصار الاستراتيجي\" الإيراني، وشنّت هجوماً تخويناً حاداً ضد الرئيس عون ورئيس الحكومة سلام، مسمّيةً إياهما \"سلطة العار\". كرّست نبيه بري مرجعيةً تفاوضية وطنية وحيدة، وأطلقت تحذيرات وجودية تقول إن \"أي خطوة باتجاه صهينة لبنان ستحرق لبنان\"."
  },
  {
    "sceneId": "scene-10",
    "paragraph": "ونختتم هذه الجولة مع صحيفة الديار، التي جمعت في عنوانها \"رسم المعادلات تحت النار: تثبيت توازن الردع الإيراني-الإسرائيلي وانعكاسه على لبنان\". أطّرت الصحيفة الرد الإيراني بـ\"كش ملك\" أجهض مخططات نتنياهو، وصوّرت ترامب بـ\"المقاول\" الساعي للصفقة لا للحرب، وهي في الوقت ذاته دعمت المسار التفاوضي لرئاسة الجمهورية، فاجتمع في صفحاتها شرعنة الردع الإيراني مع تأييد خيار الدولة اللبنانية في آنٍ واحد."
  },
  {
    "sceneId": "scene-11",
    "paragraph": "يتقاسم إعلام فريق السيادة اليوم قناعةً واحدة: أن مرحلة \"المجاملة\" مع الدور الإيراني في لبنان قد انتهت، وأن الدولة استعادت زمام القرار التفاوضي. في المقابل، يرى إعلام المقاومة أن إيران أثبتت في الميدان أنها الضمانة الفعلية لعدم انكسار لبنان، وأن \"سلطة العار\" هي التي تهدد المشروع الوطني لا المعادلات الصاروخية. والملفت أن هذا الإعلام يُحجم عن تناول الخسائر الميدانية الفعلية التي مُني بها حزب الله في الأسابيع الأخيرة. أما الفجوة الأعمق، فتكمن في أن الطرفين يتحدثان عن \"الدولة\"، لكن كلاً منهما يرى دولةً مختلفة تماماً."
  },
  {
    "sceneId": "scene-12",
    "paragraph": "فهل تنجح \"المنطقة التجريبية\" في تحوّلها نموذجاً سيادياً قابلاً للتصدير، أم أن المعادلات الإيرانية-الإسرائيلية تُحدّد ما يُتاح للدبلوماسية قبل أن تبدأ؟ هذا كان مراسل الصباح من بيروت رادار."
  }
]

Full briefing text:
الاثنين التاسع من يونيو 2026، وبيروت تصحو على مشهد مزدوج: ضربات إيرانية مباشرة نحو إسرائيل، وضربات إسرائيلية متواصلة على الضاحية والجنوب ومدينة صور، في حين يُجري السفير الأمريكي ميشال عيسى جولته على الرؤساء الثلاثة طارحاً مقترح "المنطقة التجريبية". الصحف والمواقع اليوم لا تتساءل متى يتوقف القتال فحسب، بل من يملك ورقة لبنان: طهران، أم بيروت؟

أبدأ اليوم من صحيفة الجمهورية، التي تصدّرت صفحتها الأولى بعنوان: "عون يثبّت خيار الدولة وواشنطن تمنع ربط لبنان بالحرب". ركّزت على تصريحات الرئيس جوزيف عون، متناولةً إعلانه أن لا أحد يفاوض عن لبنان غير الدولة اللبنانية، وأبرزت أن "زمن المجاملة" مع حزب الله قد انتهى وعلى لسان مسؤولين رسميين. وصفت صحيفة الجمهورية لبنان بأنه عالق بين "مطرقة إيران وسندان إسرائيل"، ورأت في الدور الأمريكي ضمانةً لمنع تحوّل البلاد إلى منصة إلزامية للردّ الإيراني.

وننتقل إلى نداء الوطن، التي عنونت "واشنطن تراهن على الدولة وتتجاوز بري والحزب"، مشهِرةً لغةً أكثر حدةً: وصفت ضمانات نبيه بري بـ"النكتة"، وطالبت بتصفية مؤسسة القرض الحسن باعتبارها "ممر لبنان نحو اللائحة السوداء"، وطرحت فكرة مقاضاة إيران قضائياً لاسترداد تعويضات عن دمار لبنان من أصولها المجمدة. أحكمت الصحيفة مثلث اتهامها: إيران المحتل، وحزب الله الميليشيا، ونبيه بري الوكيل الفاقد للصلاحية.

وفي أساس ميديا اليوم، حيث جمع العنوان الجامع مضمون اليوم: "تفكيك الدويلة العميقة: من مطار القليعات إلى فك الارتباط مع طهران". كتب زياد عيتاني متناولاً افتتاح مطار رينيه معوض في القليعات بوصفه لحظةً سيادية رمزية، مستعرضاً تاريخاً من رفض حزب الله لهذا الملف منذ 2009. وكتب وليد شقير في الموقع ذاته عن "هستيريا إيرانية بعد فقدان ورقة لبنان"، مسمّياً الرد الصاروخي الإيراني "قرارات هوجاء" نابعةً من فقدان طهران للسيطرة على القرار اللبناني.

أما في صحيفة الأخبار، التي نشرت مادتها الافتتاحية تحت عنوان "ضربات إيران: احتواء إسرائيل عبر أمريكا"، مؤطِّرةً الهجوم الصاروخي الإيراني المباشر لا بوصفه تصعيداً بل "إمساكاً بزمام المبادرة". رأت الصحيفة أن إيران استعادت المبادرة الاستراتيجية، وأن أي محاولة لإضعافها هي في جوهرها استهداف للمقاومة في لبنان، مستخدمةً مصطلح "إيران الجديدة" للإشارة إلى مرحلة تجاوزت "الصبر الاستراتيجي" نحو الفعل المباشر.

وننتقل إلى موقع المدن، الذي ذهب في الاتجاه التقني الدبلوماسي. كتب منير الربيع متناولاً كواليس تعديل البيان الثلاثي الأمريكي-اللبناني-الإسرائيلي، كاشفاً أن فكرة "المناطق النموذجية" كانت في أصلها اقتراحاً من رئيس الوفد اللبناني المفاوض سيمون كرم مستنداً إلى تجربة "جزين أولاً" في التسعينيات. وكتبت جاسنت عنتر في الموقع ذاته عن مرونة يبديها الثنائي الشيعي إزاء مصطلح "تجميد السلاح" بدلاً من نزعه، بوصفه صيغةً أكثر واقعية قد تحظى بترحيب مصري-سعودي. وحمّل الموقع إسرائيل المسؤولية عن عرقلة المسار الدبلوماسي عبر التصعيد الميداني.

وننتقل إلى صحيفة اللواء، التي أبرزت "جولة السفير الأمريكي ميشال عيسى وتثبيت صيغة المنطقة التجريبية في الجنوب"، طالبةً بفك "الاستباحة الإيرانية" وحصر السلاح والتفاوض بيد الدولة والجيش. مالت الصحيفة في تقييمها إلى الفصل بين نبيه بري "رجل الدولة" وبين حزب الله "صاحب الأخطاء الاستراتيجية"، مستحضِرةً الإرث المؤسسي السني عبر تسليط الضوء على جمعية المقاصد وتاريخها.

وننتقل إلى صحيفة الشرق الأوسط، التي أطلقت عنوان "ترامب يلجم التصعيد الإقليمي ويفرض معادلات أمنية جديدة في لبنان". وصفت الصحيفة حزب الله بـ"الفصيل المهزوم"، ورصدت ما سمّته "نكبة الإسناد" التي حطّمت نظرية الردع الحزبلاهية، واعتبرت دونالد ترامب "المايسترو" الوحيد القادر على لجم إسرائيل وفرض الحلول، مطالبةً صراحةً بانتهاء "الثلاثية الكارثية".

وننتقل إلى صحيفة البناء، التي احتفلت بعنوانها "إيران تفرض معادلة الشمال مقابل الضاحية وتكسر جمود التفاوض". وصفت ما جرى بـ"الانتصار الاستراتيجي" الإيراني، وشنّت هجوماً تخويناً حاداً ضد الرئيس عون ورئيس الحكومة سلام، مسمّيةً إياهما "سلطة العار". كرّست نبيه بري مرجعيةً تفاوضية وطنية وحيدة، وأطلقت تحذيرات وجودية تقول إن "أي خطوة باتجاه صهينة لبنان ستحرق لبنان".

ونختتم هذه الجولة مع صحيفة الديار، التي جمعت في عنوانها "رسم المعادلات تحت النار: تثبيت توازن الردع الإيراني-الإسرائيلي وانعكاسه على لبنان". أطّرت الصحيفة الرد الإيراني بـ"كش ملك" أجهض مخططات نتنياهو، وصوّرت ترامب بـ"المقاول" الساعي للصفقة لا للحرب، وهي في الوقت ذاته دعمت المسار التفاوضي لرئاسة الجمهورية، فاجتمع في صفحاتها شرعنة الردع الإيراني مع تأييد خيار الدولة اللبنانية في آنٍ واحد.

يتقاسم إعلام فريق السيادة اليوم قناعةً واحدة: أن مرحلة "المجاملة" مع الدور الإيراني في لبنان قد انتهت، وأن الدولة استعادت زمام القرار التفاوضي. في المقابل، يرى إعلام المقاومة أن إيران أثبتت في الميدان أنها الضمانة الفعلية لعدم انكسار لبنان، وأن "سلطة العار" هي التي تهدد المشروع الوطني لا المعادلات الصاروخية. والملفت أن هذا الإعلام يُحجم عن تناول الخسائر الميدانية الفعلية التي مُني بها حزب الله في الأسابيع الأخيرة. أما الفجوة الأعمق، فتكمن في أن الطرفين يتحدثان عن "الدولة"، لكن كلاً منهما يرى دولةً مختلفة تماماً.

فهل تنجح "المنطقة التجريبية" في تحوّلها نموذجاً سيادياً قابلاً للتصدير، أم أن المعادلات الإيرانية-الإسرائيلية تُحدّد ما يُتاح للدبلوماسية قبل أن تبدأ؟ هذا كان مراسل الصباح من بيروت رادار.