Create the Radar Beirut analysis pack for 2026-06-06.

Work only inside this briefing folder.

WSL / terminal path:
/mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-06

Project-relative path:
briefings/2026-06-06

Windows reference path:
C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations\briefings\2026-06-06

If running under WSL Codex CLI, use the WSL / terminal path or the project-relative path. Do not use Windows backslash paths for shell commands.

Source briefing text:
- briefings/2026-06-06/briefing_2026-06-06_corrected.txt
- when both AI-generated and human-corrected briefing text files exist, always use the `_corrected.txt` source as the editorial source of truth

Fill only these JSON files.

Use these project-relative paths for apply_patch and shell commands run from the repo root:
- briefings/2026-06-06/visual-script.json
- briefings/2026-06-06/outlet-map.json
- briefings/2026-06-06/quote-duel.json
- briefings/2026-06-06/fault-line-map-script.json
- briefings/2026-06-06/keyword-radar-script.json

If you need absolute WSL terminal paths, use these:
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-06/visual-script.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-06/outlet-map.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-06/quote-duel.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-06/fault-line-map-script.json
- /mnt/c/Users/HassanAlhajj/Desktop/MyProjects/video-animations/briefings/2026-06-06/keyword-radar-script.json

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
npm run briefing:build:folder -- --folder briefings/2026-06-06
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
    "paragraph": "اليوم السادس من يونيو 2026، وبيروت تستيقظ على زلزال دبلوماسي نادر: رئيس الجمهورية جوزيف عون أدلى بتصريحات لـ\"سي إن إن\" وجَّه فيها رسالة مباشرة إلى الحرس الثوري الإيراني، مفادها \"لبنان بلدنا وليس بلدكم\"، ونزع عن الأمين العام لحزب الله نعيم قاسم صفة تمثيل الشعب اللبناني. جاء هذا الصدام على خلفية مسودة اتفاق خرجت من واشنطن، رآها عون مساراً نحو سلام عادل، فيما وصفها رئيس مجلس النواب نبيه بري بـ\"الهجين والمفخخ\"، ورفضها حزب الله جملةً وتفصيلاً. هذا المشهد الحادّ هو الخيط الجامع لمعظم منابر اليوم، ولو أن الزوايا تتناقض والمصطلحات تتصادم."
  },
  {
    "sceneId": "scene-2",
    "paragraph": "أبدأ اليوم من جريدة الأخبار، التي أبرزت في صفحتها الأولى تحليلاً عسكرياً عن تطور أنماط الاشتباك في الجنوب. أكدت الصحيفة على ما وصفته بالتفوق التكتيكي للمقاومة عبر \"تفكيك منظومة القيادة والسيطرة الإسرائيلية\"، وصوّرت إيران مرجعيةً تفاوضية لا بديل عنها لحماية لبنان دبلوماسياً. وعلى الجانب الداخلي، هاجمت الصحيفة وزيرة التربية ريما كرامي، حمّلتها مسؤولية عرقلة إيواء النازحين في المدارس الرسمية. وفي متابعة للملف الأوسع، أشارت الصحيفة إلى أن المفاوضات النووية الإيرانية-الأمريكية تُلقي بظلالها على مسار الحل اللبناني، معتبرةً إياها الضامن الفعلي لأي هدنة في الجنوب."
  },
  {
    "sceneId": "scene-3",
    "paragraph": "وننتقل إلى جريدة نداء الوطن، التي جعلت من تصريح عون لـ\"سي إن إن\" العمود الفقري لتغطيتها. عنونت الصحيفة بـ\"استعادة القرار الوطني من منطق الساحات\"، وأطلقت على وزير الخارجية الإيراني عباس عراقجي لقب \"معالي الكذّاب\". استنهضت الصحيفة المكوّن السني السيادي كرافعة سياسية، رافضةً أن يكون اللبنانيون \"شعب نعيم قاسم\"، ومستحضرةً مطار القليعات رمزاً لسيادة الدولة الممكنة."
  },
  {
    "sceneId": "scene-4",
    "paragraph": "وننتقل إلى موقع أساس ميديا، حيث كتب زياد عيتاني متناولاً حادثة اشتباك عائشة بكار وما كشفته من أسلحة داخل الأحياء السكنية، مطالباً بـ\"إعلان بيروت الكبرى مدينةً منزوعة السلاح اليوم وليس غداً\". وفي الموقع ذاته، كتب محمد قواص متناولاً ما أسماه التواطؤ الإيراني-الإسرائيلي في نسف صفقة ترامب، مطالباً بتدخل عربي \"مارشالي\" فاعل لإنقاذ الدولة اللبنانية. أما ملاك عقيل، فكتبت متناولةً زيارة المستشار الرئاسي الفرنسي لبيروت، موضحةً أن فرنسا تسعى إلى دور \"وظيفي\" في لبنان في وقت همّشتها واشنطن فعلياً عن المفاوضات الحاسمة."
  },
  {
    "sceneId": "scene-5",
    "paragraph": "وننتقل إلى موقع المدن، حيث كتبت غادة حلاوي متناولةً زيارة قائد الجيش رودولف هيكل لإسلام آباد، قارئةً إياها مؤشراً على أن المسار التفاوضي الفعلي \"يُصاغ في إسلام آباد أكثر مما يُصاغ في واشنطن\". وفي الموقع ذاته، كتب منير الربيع متناولاً التضارب بين مسارَي التفاوض، محذراً من أن المعركة الحقيقية في لبنان ستبدأ بعد انتهاء الحرب، ومشيراً إلى أن جميع الأطراف الدولية تتهيأ لها. كتب وائل خليل ياسين كذلك متناولاً معادلة الردع المتبادل جنوباً، مستنتجاً أن الجنوب بات \"نظام توازن هش يقوم على إدارة مستمرة للتوتر لا على سلام منشود\"."
  },
  {
    "sceneId": "scene-6",
    "paragraph": "وننتقل إلى جريدة الجمهورية، التي أبرزت الانقسام اللبناني في عنوان رئيس: \"السلطة تتبنى والثنائي يرفض\". حذّرت الصحيفة من \"تصدع ديموغرافي وطائفي مرشح للانفجار\"، وحمّلت الثنائي الشيعي مسؤولية إجهاض ما سمّته \"فرصة السلام الأخيرة\"، مشيرةً إلى احتمال أن يقطع الثنائي حبل الوصل بين لبنان والعالم العربي والدولي."
  },
  {
    "sceneId": "scene-7",
    "paragraph": "وننتقل إلى جريدة اللواء، التي رصدت بكثافة تصريحات عون السيادية ونزع الشرعية التمثيلية عن حزب الله. أبرزت الصحيفة إحياء المؤسسات السنية التاريخية — المقاصد ودار الفتوى — كركيزة للدولة في مواجهة الدويلة، وسلّطت الضوء على توتر في بلدة البيسارية بين حركة أمل وحزب الله، يتصل باحتجاج أهالي المنطقة على منصات صواريخ في أحياء سكنية."
  },
  {
    "sceneId": "scene-8",
    "paragraph": "وننتقل إلى صحيفة الشرق الأوسط، التي أبرزت \"انتفاضة\" مؤسسات الدولة اللبنانية ضد الوصاية الإيرانية، تحت عنوان \"لبنان يتصدى لتوظيفه إيرانياً في المفاوضات\". وأفردت الصحيفة مساحةً لتعيين ميشال عيسى الأمريكي من أصول لبنانية سفيراً لواشنطن في بيروت، قارئةً إياه ورقةً دبلوماسية جديدة تُعزز مسار الحل السيادي بدعم سعودي متجدد."
  },
  {
    "sceneId": "scene-9",
    "paragraph": "وننتقل إلى جريدة البناء، التي قلبت المشهد رأساً على عقب. عنونت بـ\"سقوط اتفاق واشنطن: صمود الميدان يفكك الفخ الأمريكي-الإسرائيلي\"، ووصفت الرئاسة والحكومة اللبنانية بـ\"سلطة العار التي خانت لبنان\"، وحذّرت من تحويل الجيش اللبناني إلى \"جيش لحد جديد\". في المقابل، رفعت الصحيفة نبيه بري إلى مرتبة \"أيقونة تاريخ وصمام أمان\"، مستنكرةً كل ترتيب أمني لا يحفظ سلاح المقاومة."
  },
  {
    "sceneId": "scene-10",
    "paragraph": "ونختتم هذه الجولة مع جريدة الديار، التي قدّمت ما يمكن وصفه بـ\"الانفصام السيادي\": من جهة نقلت الخطاب الرئاسي الهجومي ضد إيران وقاسم كما جاء على لسان عون، ومن جهة أخرى تبنّت تشكيك بري \"الأيقوني\" في صلاحية الاتفاق ونواياه. أبقت الصحيفة على نبرة \"واقعية ميدانية\"، مؤكدةً أن أي حل لا يمر عبر توافق الثنائي الشيعي هو وهم دبلوماسي، ومشيرةً إلى أن الميدان هو الذي سيملي الشروط النهائية لا مسودات واشنطن."
  },
  {
    "sceneId": "scene-11",
    "paragraph": "حاصل اليوم الإعلامي يقع بين أقطاب ثلاثة واضحة: أغلب الصحف والمواقع تضع الصدام اللبناني-الإيراني في صدارة صفحاتها، وإعلام المقاومة يقرأ في مواقف عون تفريطاً بالسيادة واستجابةً لإملاءات خارجية، بينما تحتفي المنابر المتوافقة مع مسار بعبدا بالمشهد ذاته باعتباره لحظة استعادة تاريخية للقرار الوطني. وثمة خيط مشترك خفي يربط الجميع: الكلفة الإنسانية — أرقام الشهداء، والنازحون، ودمار قرى الجنوب — كادت تختفي من الصفحات الأولى، حلّت محلها سجالات وجودية حول الشرعية التمثيلية وفخاخ الدساتير."
  },
  {
    "sceneId": "scene-12",
    "paragraph": "هل ينجح عون في إقناع الرأي العام اللبناني والإقليمي بأن الانفصال عن إيران ممكن، في بلد تتشابك فيه جذور المحور مع جذور الدولة؟ هذا كان مراسل الصباح من بيروت رادار."
  }
]

Full briefing text:
اليوم السادس من يونيو 2026، وبيروت تستيقظ على زلزال دبلوماسي نادر: رئيس الجمهورية جوزيف عون أدلى بتصريحات لـ"سي إن إن" وجَّه فيها رسالة مباشرة إلى الحرس الثوري الإيراني، مفادها "لبنان بلدنا وليس بلدكم"، ونزع عن الأمين العام لحزب الله نعيم قاسم صفة تمثيل الشعب اللبناني. جاء هذا الصدام على خلفية مسودة اتفاق خرجت من واشنطن، رآها عون مساراً نحو سلام عادل، فيما وصفها رئيس مجلس النواب نبيه بري بـ"الهجين والمفخخ"، ورفضها حزب الله جملةً وتفصيلاً. هذا المشهد الحادّ هو الخيط الجامع لمعظم منابر اليوم، ولو أن الزوايا تتناقض والمصطلحات تتصادم.

أبدأ اليوم من جريدة الأخبار، التي أبرزت في صفحتها الأولى تحليلاً عسكرياً عن تطور أنماط الاشتباك في الجنوب. أكدت الصحيفة على ما وصفته بالتفوق التكتيكي للمقاومة عبر "تفكيك منظومة القيادة والسيطرة الإسرائيلية"، وصوّرت إيران مرجعيةً تفاوضية لا بديل عنها لحماية لبنان دبلوماسياً. وعلى الجانب الداخلي، هاجمت الصحيفة وزيرة التربية ريما كرامي، حمّلتها مسؤولية عرقلة إيواء النازحين في المدارس الرسمية. وفي متابعة للملف الأوسع، أشارت الصحيفة إلى أن المفاوضات النووية الإيرانية-الأمريكية تُلقي بظلالها على مسار الحل اللبناني، معتبرةً إياها الضامن الفعلي لأي هدنة في الجنوب.

وننتقل إلى جريدة نداء الوطن، التي جعلت من تصريح عون لـ"سي إن إن" العمود الفقري لتغطيتها. عنونت الصحيفة بـ"استعادة القرار الوطني من منطق الساحات"، وأطلقت على وزير الخارجية الإيراني عباس عراقجي لقب "معالي الكذّاب". استنهضت الصحيفة المكوّن السني السيادي كرافعة سياسية، رافضةً أن يكون اللبنانيون "شعب نعيم قاسم"، ومستحضرةً مطار القليعات رمزاً لسيادة الدولة الممكنة.

وننتقل إلى موقع أساس ميديا، حيث كتب زياد عيتاني متناولاً حادثة اشتباك عائشة بكار وما كشفته من أسلحة داخل الأحياء السكنية، مطالباً بـ"إعلان بيروت الكبرى مدينةً منزوعة السلاح اليوم وليس غداً". وفي الموقع ذاته، كتب محمد قواص متناولاً ما أسماه التواطؤ الإيراني-الإسرائيلي في نسف صفقة ترامب، مطالباً بتدخل عربي "مارشالي" فاعل لإنقاذ الدولة اللبنانية. أما ملاك عقيل، فكتبت متناولةً زيارة المستشار الرئاسي الفرنسي لبيروت، موضحةً أن فرنسا تسعى إلى دور "وظيفي" في لبنان في وقت همّشتها واشنطن فعلياً عن المفاوضات الحاسمة.

وننتقل إلى موقع المدن، حيث كتبت غادة حلاوي متناولةً زيارة قائد الجيش رودولف هيكل لإسلام آباد، قارئةً إياها مؤشراً على أن المسار التفاوضي الفعلي "يُصاغ في إسلام آباد أكثر مما يُصاغ في واشنطن". وفي الموقع ذاته، كتب منير الربيع متناولاً التضارب بين مسارَي التفاوض، محذراً من أن المعركة الحقيقية في لبنان ستبدأ بعد انتهاء الحرب، ومشيراً إلى أن جميع الأطراف الدولية تتهيأ لها. كتب وائل خليل ياسين كذلك متناولاً معادلة الردع المتبادل جنوباً، مستنتجاً أن الجنوب بات "نظام توازن هش يقوم على إدارة مستمرة للتوتر لا على سلام منشود".

وننتقل إلى جريدة الجمهورية، التي أبرزت الانقسام اللبناني في عنوان رئيس: "السلطة تتبنى والثنائي يرفض". حذّرت الصحيفة من "تصدع ديموغرافي وطائفي مرشح للانفجار"، وحمّلت الثنائي الشيعي مسؤولية إجهاض ما سمّته "فرصة السلام الأخيرة"، مشيرةً إلى احتمال أن يقطع الثنائي حبل الوصل بين لبنان والعالم العربي والدولي.

وننتقل إلى جريدة اللواء، التي رصدت بكثافة تصريحات عون السيادية ونزع الشرعية التمثيلية عن حزب الله. أبرزت الصحيفة إحياء المؤسسات السنية التاريخية — المقاصد ودار الفتوى — كركيزة للدولة في مواجهة الدويلة، وسلّطت الضوء على توتر في بلدة البيسارية بين حركة أمل وحزب الله، يتصل باحتجاج أهالي المنطقة على منصات صواريخ في أحياء سكنية.

وننتقل إلى صحيفة الشرق الأوسط، التي أبرزت "انتفاضة" مؤسسات الدولة اللبنانية ضد الوصاية الإيرانية، تحت عنوان "لبنان يتصدى لتوظيفه إيرانياً في المفاوضات". وأفردت الصحيفة مساحةً لتعيين ميشال عيسى الأمريكي من أصول لبنانية سفيراً لواشنطن في بيروت، قارئةً إياه ورقةً دبلوماسية جديدة تُعزز مسار الحل السيادي بدعم سعودي متجدد.

وننتقل إلى جريدة البناء، التي قلبت المشهد رأساً على عقب. عنونت بـ"سقوط اتفاق واشنطن: صمود الميدان يفكك الفخ الأمريكي-الإسرائيلي"، ووصفت الرئاسة والحكومة اللبنانية بـ"سلطة العار التي خانت لبنان"، وحذّرت من تحويل الجيش اللبناني إلى "جيش لحد جديد". في المقابل، رفعت الصحيفة نبيه بري إلى مرتبة "أيقونة تاريخ وصمام أمان"، مستنكرةً كل ترتيب أمني لا يحفظ سلاح المقاومة.

ونختتم هذه الجولة مع جريدة الديار، التي قدّمت ما يمكن وصفه بـ"الانفصام السيادي": من جهة نقلت الخطاب الرئاسي الهجومي ضد إيران وقاسم كما جاء على لسان عون، ومن جهة أخرى تبنّت تشكيك بري "الأيقوني" في صلاحية الاتفاق ونواياه. أبقت الصحيفة على نبرة "واقعية ميدانية"، مؤكدةً أن أي حل لا يمر عبر توافق الثنائي الشيعي هو وهم دبلوماسي، ومشيرةً إلى أن الميدان هو الذي سيملي الشروط النهائية لا مسودات واشنطن.

حاصل اليوم الإعلامي يقع بين أقطاب ثلاثة واضحة: أغلب الصحف والمواقع تضع الصدام اللبناني-الإيراني في صدارة صفحاتها، وإعلام المقاومة يقرأ في مواقف عون تفريطاً بالسيادة واستجابةً لإملاءات خارجية، بينما تحتفي المنابر المتوافقة مع مسار بعبدا بالمشهد ذاته باعتباره لحظة استعادة تاريخية للقرار الوطني. وثمة خيط مشترك خفي يربط الجميع: الكلفة الإنسانية — أرقام الشهداء، والنازحون، ودمار قرى الجنوب — كادت تختفي من الصفحات الأولى، حلّت محلها سجالات وجودية حول الشرعية التمثيلية وفخاخ الدساتير.

هل ينجح عون في إقناع الرأي العام اللبناني والإقليمي بأن الانفصال عن إيران ممكن، في بلد تتشابك فيه جذور المحور مع جذور الدولة؟ هذا كان مراسل الصباح من بيروت رادار.