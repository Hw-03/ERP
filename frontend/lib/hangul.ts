// 두벌식 표준 키보드 기준 한글 ↔ QWERTY 변환
// 사용 목적: 한/영 키가 영어 상태(또는 Caps Lock)에서 한글 자판으로 입력한
// 영타를 입력 시점에 한글로 조립해 보여주고, 이름 검색에 매칭한다.
// 단순화를 위해 대소문자를 구분하지 않는다(쌍자음/ㅒㅖ는 기본 자모로 근사).

const CHO_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG_LIST = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG_LIST = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

// 호환 자모 → QWERTY 키 (소문자 기준; 겹받침/겹모음은 키 조합)
const JAMO_TO_KEY: Record<string, string> = {
  ㄱ:'r', ㄲ:'r', ㄴ:'s', ㄷ:'e', ㄸ:'e', ㄹ:'f', ㅁ:'a', ㅂ:'q', ㅃ:'q',
  ㅅ:'t', ㅆ:'t', ㅇ:'d', ㅈ:'w', ㅉ:'w', ㅊ:'c', ㅋ:'z', ㅌ:'x', ㅍ:'v', ㅎ:'g',
  ㄳ:'rt', ㄵ:'sw', ㄶ:'sg', ㄺ:'fr', ㄻ:'fa', ㄼ:'fq', ㄽ:'ft', ㄾ:'fx', ㄿ:'fv', ㅀ:'fg', ㅄ:'qt',
  ㅏ:'k', ㅐ:'o', ㅑ:'i', ㅒ:'o', ㅓ:'j', ㅔ:'p', ㅕ:'u', ㅖ:'p', ㅗ:'h',
  ㅘ:'hk', ㅙ:'ho', ㅚ:'hl', ㅛ:'y', ㅜ:'n', ㅝ:'nj', ㅞ:'np', ㅟ:'nl', ㅠ:'b',
  ㅡ:'m', ㅢ:'ml', ㅣ:'l',
};

// QWERTY 키(소문자) → 자모
const KEY_TO_JAMO: Record<string, string> = {
  r:'ㄱ', s:'ㄴ', e:'ㄷ', f:'ㄹ', a:'ㅁ', q:'ㅂ', t:'ㅅ', d:'ㅇ',
  w:'ㅈ', c:'ㅊ', z:'ㅋ', x:'ㅌ', v:'ㅍ', g:'ㅎ',
  k:'ㅏ', o:'ㅐ', i:'ㅑ', j:'ㅓ', p:'ㅔ', u:'ㅕ', h:'ㅗ',
  y:'ㅛ', n:'ㅜ', b:'ㅠ', m:'ㅡ', l:'ㅣ',
};

const JUNG_COMBO: Record<string, string> = {
  'ㅗㅏ':'ㅘ','ㅗㅐ':'ㅙ','ㅗㅣ':'ㅚ',
  'ㅜㅓ':'ㅝ','ㅜㅔ':'ㅞ','ㅜㅣ':'ㅟ',
  'ㅡㅣ':'ㅢ',
};
const JONG_COMBO: Record<string, string> = {
  'ㄱㅅ':'ㄳ','ㄴㅈ':'ㄵ','ㄴㅎ':'ㄶ','ㄹㄱ':'ㄺ','ㄹㅁ':'ㄻ',
  'ㄹㅂ':'ㄼ','ㄹㅅ':'ㄽ','ㄹㅌ':'ㄾ','ㄹㅍ':'ㄿ','ㄹㅎ':'ㅀ','ㅂㅅ':'ㅄ',
};
const JONG_SPLIT: Record<string, [string, string]> = {
  'ㄳ':['ㄱ','ㅅ'],'ㄵ':['ㄴ','ㅈ'],'ㄶ':['ㄴ','ㅎ'],'ㄺ':['ㄹ','ㄱ'],
  'ㄻ':['ㄹ','ㅁ'],'ㄼ':['ㄹ','ㅂ'],'ㄽ':['ㄹ','ㅅ'],'ㄾ':['ㄹ','ㅌ'],
  'ㄿ':['ㄹ','ㅍ'],'ㅀ':['ㄹ','ㅎ'],'ㅄ':['ㅂ','ㅅ'],
};

const isVowel = (j: string) => JUNG_LIST.includes(j);
const canBeJong = (j: string) => JONG_LIST.includes(j);

// 한글(완성형 음절 또는 호환 자모) → QWERTY
export function toQwerty(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const offset = code - 0xac00;
      const cho = CHO_LIST[Math.floor(offset / 28 / 21)];
      const jung = JUNG_LIST[Math.floor(offset / 28) % 21];
      const jong = JONG_LIST[offset % 28];
      out += JAMO_TO_KEY[cho] + JAMO_TO_KEY[jung] + (jong ? JAMO_TO_KEY[jong] : '');
    } else if (JAMO_TO_KEY[ch]) {
      out += JAMO_TO_KEY[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

// 완성형 음절 → 초성 자모(예: "김건호" → "ㄱㄱㅎ"). 자모/라틴/기타 문자는 그대로 통과.
// 이름 초성검색에 사용 — 매칭 시 query 와 비교한다.
export function toChosung(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += CHO_LIST[Math.floor((code - 0xac00) / 28 / 21)];
    } else {
      out += ch;
    }
  }
  return out;
}

// QWERTY → 한글. 두벌식 오토마타로 음절을 조립한다.
// 매핑되지 않는 문자(숫자/공백 등)는 그대로 통과시킨다.
export function toHangul(input: string): string {
  let result = '';
  let cho = '', jung = '', jong = '';

  const flush = () => {
    if (cho && jung) {
      const ci = CHO_LIST.indexOf(cho);
      const ji = JUNG_LIST.indexOf(jung);
      const ki = jong ? JONG_LIST.indexOf(jong) : 0;
      result += String.fromCharCode(0xac00 + (ci * 21 + ji) * 28 + ki);
    } else {
      result += (cho || '') + (jung || '') + (jong || '');
    }
    cho = ''; jung = ''; jong = '';
  };

  for (const raw of input) {
    const jamo = KEY_TO_JAMO[raw.toLowerCase()];
    if (!jamo) {
      flush();
      result += raw;
      continue;
    }

    if (isVowel(jamo)) {
      if (jong) {
        // 받침이 새 음절의 초성으로 이동 (겹받침은 분리)
        const split = JONG_SPLIT[jong];
        const moved = split ? split[1] : jong;
        jong = split ? split[0] : '';
        flush();
        cho = moved; jung = jamo;
      } else if (jung) {
        const combo = JUNG_COMBO[jung + jamo];
        if (combo) {
          jung = combo;
        } else {
          flush();
          jung = jamo;
        }
      } else {
        jung = jamo;
      }
    } else {
      // 자음
      if (!cho && !jung) {
        cho = jamo;
      } else if (cho && !jung) {
        flush();
        cho = jamo;
      } else if (jung && !jong) {
        if (canBeJong(jamo)) {
          jong = jamo;
        } else {
          flush();
          cho = jamo;
        }
      } else {
        const combo = JONG_COMBO[jong + jamo];
        if (combo) {
          jong = combo;
        } else {
          flush();
          cho = jamo;
        }
      }
    }
  }
  flush();
  return result;
}
