export function scriptMessages({ topic, lengthSeconds, styleGuide }) {
  const targetWords = Math.round(2.6 * lengthSeconds);
  return [
    {
      role: 'system',
      content:
        'انت كاتب سكريبت لسلسلة ريلز علمية مصرية اسمها «عارف ليه؟». اكتب باللهجة المصرية البسيطة. ' +
        'التزم بالستايل جايد ده حرفياً:\n\n' + styleGuide,
    },
    {
      role: 'user',
      content:
        `الموضوع: ${topic}\n` +
        `مدة الفيديو: ${lengthSeconds} ثانية (حوالي ${targetWords} كلمة بمعدل 2.6 كلمة/ثانية).\n` +
        'اكتب السكريبت بالشكل ده بالظبط:\nTITLE: <عنوان قصير>\nSCRIPT:\n<سطور السكريبت>\nSOURCES:\n<مصادر أو "معلومات علمية عامة">',
    },
  ];
}

export const SCENE_TYPES = ['intro', 'question', 'concept', 'process', 'compare', 'stat', 'recap'];
export const TEMPLATES = ['body', 'zoom', 'flow', 'cycle', 'timeline', 'chart', 'layers', 'cards', 'meter'];

export function storyboardMessages({ title, tokens, scriptText }) {
  const n = tokens.length;
  return [
    {
      role: 'system',
      content:
        'انت مخرج فني لريلز علمية. مهمتك تحوّل سكريبت لستوري بورد JSON. ' +
        'STORYBOARD MODE: ردّك JSON بس، بدون أي شرح أو markdown.',
    },
    {
      role: 'user',
      content:
        `العنوان: ${title}\nالسكريبت:\n${scriptText}\n\n` +
        `السكريبت متقسم لـ ${n} كلمة (توكن) بأرقام من 0 لـ ${n - 1}:\n` +
        tokens.map((w, i) => `${i}:${w}`).join(' ') + '\n\n' +
        'رجّع JSON بالشكل ده بس:\n' +
        '{"scenes":[{"type":"intro|question|concept|process|compare|stat|recap","template":"body|zoom|flow|cycle|timeline|chart|layers|cards|meter","at":<wordIndex>,"icon":"simple-english-noun","label":"نص عربي قصير اختياري"}],"accents":[[<wordIndex>,"accent|underline"]]}\n\n' +
        'قواعد:\n' +
        '- أول scene لازم intro عند at=0.\n' +
        '- من 3 لـ 6 scenes مرتبة حسب at، والأرقام جوه الرينج.\n' +
        '- متكررش نفس الـ template 3 مرات ورا بعض.\n' +
        '- الأيقونات أسماء إنجليزية بسيطة (heart, brain, wave, star, atom, dna, eye, sun, bolt...).\n' +
        '- accents على الكلمات المهمة (من 2 لـ 6 كلمات).',
    },
  ];
}

export function selfReviewMessages({ storyboard, tokens }) {
  return [
    {
      role: 'system',
      content:
        'انت مخرج فني بتراجع ستوري بورد. SELF-REVIEW MODE: ردّك JSON بس بنفس الشكل، بدون شرح.',
    },
    {
      role: 'user',
      content:
        'راجع الستوري بورد ده وحسّن اختيارات الـ scenes الضعيفة: بدّل templates مكررة، ظبط أماكن الـ scenes على حدود الجمل، وزوّد accents لو المحتوى مهم.\n' +
        `عدد الكلمات: ${tokens.length} (indices من 0 لـ ${tokens.length - 1}).\n` +
        'الستوري بورد الحالي:\n' + JSON.stringify(storyboard),
    },
  ];
}
