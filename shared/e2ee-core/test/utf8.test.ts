import { afterEach, describe, expect, it } from 'vitest'
import { InvalidUtf8Error, pureUtf8Encode, resetUtf8PathForTests, strictUtf8Decode } from '../src/utf8'
import { fromUtf8, utf8, utf8Path } from '../src/index'

const b = (...x: number[]) => new Uint8Array(x)

const VALID: [string, Uint8Array, string][] = [
  ['ascii', b(0x68, 0x69), 'hi'],
  ['2 bayt', b(0xc3, 0xa7), 'ç'],
  ['3 bayt', b(0xe2, 0x82, 0xac), '€'],
  ['4 bayt', b(0xf0, 0x9f, 0x94, 0x92), '🔒'],
  ['U+10FFFF', b(0xf4, 0x8f, 0xbf, 0xbf), '\u{10ffff}'],
  ['U+0800 alt sınır', b(0xe0, 0xa0, 0x80), 'ࠀ'],
  ['U+D7FF', b(0xed, 0x9f, 0xbf), '퟿'],
  ['boş', b(), ''],
]

const INVALID: [string, Uint8Array][] = [
  ['tek devam baytı', b(0x80)],
  ['0xFF', b(0xff)],
  ['aşırı uzun C0 80', b(0xc0, 0x80)],
  ['aşırı uzun C1 BF', b(0xc1, 0xbf)],
  ['aşırı uzun E0 80 80', b(0xe0, 0x80, 0x80)],
  ['aşırı uzun F0 80 80 80', b(0xf0, 0x80, 0x80, 0x80)],
  ['vekil ED A0 80 (U+D800)', b(0xed, 0xa0, 0x80)],
  ['vekil çifti ED A0 BD ED B2 92', b(0xed, 0xa0, 0xbd, 0xed, 0xb2, 0x92)],
  ['U+110000 F4 90 80 80', b(0xf4, 0x90, 0x80, 0x80)],
  ['F5 baş bayt', b(0xf5, 0x80, 0x80, 0x80)],
  ['kesik 2 bayt', b(0xc3)],
  ['kesik 4 bayt', b(0xf0, 0x9f, 0x94)],
  ['geçersiz devam', b(0xe2, 0x28, 0xa1)],
]

const original = Object.getOwnPropertyDescriptor(globalThis, 'TextDecoder')

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'TextDecoder', original)
  resetUtf8PathForTests()
})

function suite(label: string, setup: () => void, expectedPath: 'builtin' | 'pure') {
  describe(`UTF-8 (${label})`, () => {
    it('yol seçimi', () => {
      setup()
      expect(utf8Path()).toBe(expectedPath)
    })
    it.each(VALID)('geçerli: %s', (_n, bytes, text) => {
      setup()
      expect(fromUtf8(bytes)).toBe(text)
    })
    it.each(INVALID)('geçersiz reddedilir: %s', (_n, bytes) => {
      setup()
      expect(() => fromUtf8(bytes)).toThrow()
    })
    it('gidiş dönüş (Türkçe + emoji)', () => {
      setup()
      const s = 'merhaba çğıöşü İ 🔒 \u{10ffff}'
      expect(fromUtf8(utf8(s))).toBe(s)
    })
  })
}

suite('yerleşik', () => resetUtf8PathForTests(), 'builtin')
suite(
  'saf JS, TextDecoder yok',
  () => {
    Object.defineProperty(globalThis, 'TextDecoder', { value: undefined, configurable: true, writable: true })
    resetUtf8PathForTests()
  },
  'pure',
)
suite(
  'saf JS, fatal yok sayan TextDecoder',
  () => {
    class Lenient {
      decode(b: Uint8Array) {
        return new original!.value('utf-8').decode(b) // fatal'sız: geçersizi U+FFFD yapar
      }
    }
    Object.defineProperty(globalThis, 'TextDecoder', { value: Lenient, configurable: true, writable: true })
    resetUtf8PathForTests()
  },
  'pure',
)

describe('saf yol, yerleşikle aynı sonuç', () => {
  it('strictUtf8Decode ve pureUtf8Encode TextEncoder/TextDecoder ile uyumlu', () => {
    for (const s of ['', 'a', 'çğıöşü', '€', '🔒🔒', '\u{10ffff}', 'xࠀy']) {
      const native = new TextEncoder().encode(s)
      expect([...pureUtf8Encode(s)]).toEqual([...native])
      expect(strictUtf8Decode(native)).toBe(s)
    }
  })
  it('eşleşmemiş vekil U+FFFD olarak kodlanır (TextEncoder gibi)', () => {
    expect([...pureUtf8Encode('\ud800')]).toEqual([...new TextEncoder().encode('\ud800')])
  })
  it('baştaki BOM atılır (TextDecoder varsayılanı)', () => {
    expect(strictUtf8Decode(b(0xef, 0xbb, 0xbf, 0x61))).toBe(new TextDecoder().decode(b(0xef, 0xbb, 0xbf, 0x61)))
  })
  it('hata türü InvalidUtf8Error', () => {
    expect(() => strictUtf8Decode(b(0xff))).toThrow(InvalidUtf8Error)
  })
})
