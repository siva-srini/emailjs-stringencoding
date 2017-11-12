import { encode, decode } from './stringencoding'

const MIN_CODEPOINT = 0
const MAX_CODEPOINT = 0x10FFFF
const BLOCK_SIZE = 0x1000

describe('String encoding', () => {
  it('should encode/decode simple sample', () => {
    const sample = 'I ½ ♥ 𩶘'
    const expected = [73, 32, 194, 189, 32, 226, 153, 165, 32, 240, 169, 182, 152]
    const encoded = encode(sample)
    const decoded = decode(new Uint8Array(expected))
    console.log(encoded)
    console.log(decoded)
    expect(encoded).to.deep.equal(new Uint8Array(expected))
    expect(decoded).to.deep.equal(sample)
  })

  it('should encode/decode UTF8 Sample', () => {
    // z, cent, CJK water, G-Clef, Private-use character
    const sample = 'z\xA2\u6C34\uD834\uDD1E\uDBFF\uDFFD'
    const expected = [0x7A, 0xC2, 0xA2, 0xE6, 0xB0, 0xB4, 0xF0, 0x9D, 0x84, 0x9E, 0xF4, 0x8F, 0xBF, 0xBD]
    const encoded = encode(sample)
    const decoded = decode(new Uint8Array(expected))
    expect(encoded).to.deep.equal(new Uint8Array(expected))
    expect(decoded).to.deep.equal(sample)
  })

  for (let i = MIN_CODEPOINT; i < MAX_CODEPOINT; i += BLOCK_SIZE) {
    const blockTag = cpname(i) + ' - ' + cpname(i + BLOCK_SIZE - 1)

    it(`should encode/decode block ${blockTag}`, () => {
      const block = genblock(i, BLOCK_SIZE)

      const encoded = encode(block)
      const decoded = decode(encoded)
      expect(decoded).to.deep.equal(block)

      const expEncoded = encodeUtf8(block)
      const expDecoded = decodeUtf8(expEncoded)

      expect(encoded).to.deep.equal(expEncoded)
      expect(decoded).to.deep.equal(expDecoded)
    })
  }
})

function encodeUtf8 (string) {
  var utf8 = unescape(encodeURIComponent(string))
  var octets = new Uint8Array(utf8.length)
  for (let i = 0; i < utf8.length; i += 1) {
    octets[i] = utf8.charCodeAt(i)
  }
  return octets
}

function decodeUtf8 (octets) {
  return decodeURIComponent(escape(String.fromCharCode.apply(null, octets)))
}

function cpname (n) {
  if (n + 0 !== n) { return n.toString() }
  var w = (n <= 0xFFFF) ? 4 : 6
  return 'U+' + ('000000' + n.toString(16).toUpperCase()).slice(-w)
}

function genblock (from, len) {
  var i, j, point, offset
  var size, block

  // determine size required:
  //    1 unit   for each point from U+000000 through U+00D7FF
  //    0 units                      U+00D800 through U+00DFFF
  //    1 unit                       U+00E000 through U+00FFFF
  //    2 units                      U+010000 through U+10FFFF
  function overlap (min1, max1, min2, max2) {
    return Math.max(0, Math.min(max1, max2) - Math.max(min1, min2))
  }
  size = (overlap(from, from + len, 0x000000, 0x00D800) +
          overlap(from, from + len, 0x00E000, 0x010000) +
          overlap(from, from + len, 0x010000, 0x110000) * 2)

  block = new Uint16Array(size)
  for (i = 0, j = 0; i < len; i++) {
    point = from + i
    if (point >= 0xD800 && point <= 0xDFFF) { continue } else if (point <= 0xFFFF) { block[j++] = point } else {
      offset = point - 0x10000
      block[j++] = 0xD800 + (offset >> 10)
      block[j++] = 0xDC00 + (offset & 0x3FF)
    }
  }
  return String.fromCharCode.apply(null, block)
}
