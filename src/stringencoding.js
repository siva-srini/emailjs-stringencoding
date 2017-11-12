/* eslint-disable camelcase */

const ERROR_SYMBOL = 0xFFFD

var EOF_byte = -1
var EOF_code_point = -1

function ByteInputStream (bytes) {
  var pos = 0

  this.get = function () {
    return (pos >= bytes.length) ? EOF_byte : Number(bytes[pos])
  }

  this.offset = function (n) {
    pos += n
    if (pos < 0) {
      throw new Error('Seeking past start of the buffer')
    }
    if (pos > bytes.length) {
      throw new Error('Seeking past EOF')
    }
  }
}

function ByteOutputStream (bytes) {
  var pos = 0

  this.emit = function (var_args) {
    var last = EOF_byte
    var i
    for (i = 0; i < arguments.length; ++i) {
      last = Number(arguments[i])
      bytes[pos++] = last
    }
    return last
  }
}

function CodePointInputStream (string) {
  function stringToCodePoints (string) {
    var cps = []
    var i = 0
    var n = string.length
    while (i < string.length) {
      var c = string.charCodeAt(i)
      if (!inRange(c, 0xD800, 0xDFFF)) {
        cps.push(c)
      } else if (inRange(c, 0xDC00, 0xDFFF)) {
        cps.push(0xFFFD)
      } else { // (inRange(cu, 0xD800, 0xDBFF))
        if (i === n - 1) {
          cps.push(0xFFFD)
        } else {
          var d = string.charCodeAt(i + 1)
          if (inRange(d, 0xDC00, 0xDFFF)) {
            var a = c & 0x3FF
            var b = d & 0x3FF
            i += 1
            cps.push(0x10000 + (a << 10) + b)
          } else {
            cps.push(0xFFFD)
          }
        }
      }
      i += 1
    }
    return cps
  }

  var pos = 0
  var cps = stringToCodePoints(string)

  this.offset = function (n) {
    pos += n
    if (pos < 0) {
      throw new Error('Seeking past start of the buffer')
    }
    if (pos > cps.length) {
      throw new Error('Seeking past EOF')
    }
  }

  this.get = function () {
    if (pos >= cps.length) {
      return EOF_code_point
    }
    return cps[pos]
  }
}

function CodePointOutputStream () {
  var string = ''

  this.string = function () {
    return string
  }

  this.emit = function (c) {
    if (c <= 0xFFFF) {
      string += String.fromCharCode(c)
    } else {
      c -= 0x10000
      string += String.fromCharCode(0xD800 + ((c >> 10) & 0x3ff))
      string += String.fromCharCode(0xDC00 + (c & 0x3ff))
    }
  }
}

export function decode (bytes) {
  const decoder = new UTF8Decoder()
  var input_stream = new ByteInputStream(bytes)
  var output_stream = new CodePointOutputStream()

  while (input_stream.get() !== EOF_byte) {
    let code_point = decoder.decode(input_stream)
    if (code_point !== null && code_point !== EOF_code_point) {
      output_stream.emit(code_point)
    }
  }

  let code_point
  do {
    code_point = decoder.decode(input_stream)
    if (code_point !== null && code_point !== EOF_code_point) {
      output_stream.emit(code_point)
    }
  } while (code_point !== EOF_code_point && input_stream.get() !== EOF_byte)

  var result = output_stream.string()
  if (result.charCodeAt(0) === 0xFEFF) {
    result = result.substring(1)
  }

  return result
}

export function encode (opt_string) {
  const encoder = new UTF8Encoder()

  var bytes = []
  var output_stream = new ByteOutputStream(bytes)
  var input_stream = new CodePointInputStream(opt_string)
  while (input_stream.get() !== EOF_code_point) {
    encoder.encode(output_stream, input_stream)
  }
  var last_byte
  do {
    last_byte = encoder.encode(output_stream, input_stream)
  } while (last_byte !== EOF_byte)
  return new Uint8Array(bytes)
}

function UTF8Decoder () {
  var utf8_code_point = 0
  var utf8_bytes_needed = 0
  var utf8_bytes_seen = 0
  var utf8_lower_boundary = 0

  this.decode = function (byte_pointer) {
    var bite = byte_pointer.get()
    if (bite === EOF_byte) {
      if (utf8_bytes_needed !== 0) {
        return ERROR_SYMBOL
      }
      return EOF_code_point
    }
    byte_pointer.offset(1)

    if (utf8_bytes_needed === 0) {
      if (inRange(bite, 0x00, 0x7F)) {
        return bite
      }
      if (inRange(bite, 0xC2, 0xDF)) {
        utf8_bytes_needed = 1
        utf8_lower_boundary = 0x80
        utf8_code_point = bite - 0xC0
      } else if (inRange(bite, 0xE0, 0xEF)) {
        utf8_bytes_needed = 2
        utf8_lower_boundary = 0x800
        utf8_code_point = bite - 0xE0
      } else if (inRange(bite, 0xF0, 0xF4)) {
        utf8_bytes_needed = 3
        utf8_lower_boundary = 0x10000
        utf8_code_point = bite - 0xF0
      } else {
        return ERROR_SYMBOL
      }
      utf8_code_point = utf8_code_point * Math.pow(64, utf8_bytes_needed)
      return null
    }
    if (!inRange(bite, 0x80, 0xBF)) {
      utf8_code_point = 0
      utf8_bytes_needed = 0
      utf8_bytes_seen = 0
      utf8_lower_boundary = 0
      byte_pointer.offset(-1)
      return ERROR_SYMBOL
    }
    utf8_bytes_seen += 1
    utf8_code_point = utf8_code_point + (bite - 0x80) * Math.pow(64, utf8_bytes_needed - utf8_bytes_seen)
    if (utf8_bytes_seen !== utf8_bytes_needed) {
      return null
    }
    var code_point = utf8_code_point
    var lower_boundary = utf8_lower_boundary
    utf8_code_point = 0
    utf8_bytes_needed = 0
    utf8_bytes_seen = 0
    utf8_lower_boundary = 0
    if (inRange(code_point, lower_boundary, 0x10FFFF) && !inRange(code_point, 0xD800, 0xDFFF)) {
      return code_point
    }
    return ERROR_SYMBOL
  }
}

function UTF8Encoder () {
  this.encode = function (output_byte_stream, code_point_pointer) {
    var code_point = code_point_pointer.get()
    if (code_point === EOF_code_point) {
      return EOF_byte
    }
    code_point_pointer.offset(1)
    if (inRange(code_point, 0xD800, 0xDFFF)) {
      throw new Error('The code point ' + code_point + ' could not be encoded.')
    }
    if (inRange(code_point, 0x0000, 0x007f)) {
      return output_byte_stream.emit(code_point)
    }
    var count, offset
    if (inRange(code_point, 0x0080, 0x07FF)) {
      count = 1
      offset = 0xC0
    } else if (inRange(code_point, 0x0800, 0xFFFF)) {
      count = 2
      offset = 0xE0
    } else if (inRange(code_point, 0x10000, 0x10FFFF)) {
      count = 3
      offset = 0xF0
    }
    var result = output_byte_stream.emit(div(code_point, Math.pow(64, count)) + offset)
    while (count > 0) {
      var temp = div(code_point, Math.pow(64, count - 1))
      result = output_byte_stream.emit(0x80 + (temp % 64))
      count -= 1
    }
    return result
  }
}

function inRange (a, min, max) {
  return min <= a && a <= max
}

function div (n, d) {
  return Math.floor(n / d)
}
