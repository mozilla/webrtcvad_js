// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function read(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return xhr.response;
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}
if (!Module['quit']) {
  Module['quit'] = function(status, toThrow) {
    throw toThrow;
  }
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
    return value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      // optimize away arguments usage in common cases
      if (sig.length === 1) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func);
        };
      } else if (sig.length === 2) {
        sigCache[func] = function dynCall_wrapper(arg) {
          return Runtime.dynCall(sig, func, [arg]);
        };
      } else {
        // general case
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
        };
      }
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { assert(DYNAMICTOP_PTR);var ret = HEAP32[DYNAMICTOP_PTR>>2];var end = (((ret + size + 15)|0) & -16);HEAP32[DYNAMICTOP_PTR>>2] = end;if (end >= TOTAL_MEMORY) {var success = enlargeMemory();if (!success) {HEAP32[DYNAMICTOP_PTR>>2] = ret;return 0;}}return ret;},
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = Runtime.stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface.
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }

  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;


function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var __cxa_demangle_func = Module['___cxa_demangle'] || Module['__cxa_demangle'];
  if (__cxa_demangle_func) {
    try {
      var s =
        func.substr(1);
      var len = lengthBytesUTF8(s)+1;
      var buf = _malloc(len);
      stringToUTF8(s, buf, len);
      var status = _malloc(4);
      var ret = __cxa_demangle_func(buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed
    } catch(e) {
      // ignore problems here
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
    // failure when using libcxxabi, don't demangle
    return func;
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - asm.stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
function writeStringToMemory(string, buffer, dontAddNull) {
  Runtime.warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var lastChar, end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

if (!Math['trunc']) Math['trunc'] = function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};
Math.trunc = Math['trunc'];

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = 8;

STATICTOP = STATIC_BASE + 7952;
  /* global initializers */  __ATINIT__.push();
  

/* memory initializer */ allocate([64,31,0,0,128,62,0,0,0,125,0,0,128,187,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,236,24,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,1,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,8,27,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,1,0,0,82,26,28,19,153,27,59,26,115,26,41,13,222,29,23,15,140,30,98,28,156,19,10,17,114,32,101,39,94,39,47,46,67,46,165,24,1,37,99,37,127,42,157,29,244,31,59,29,122,1,40,4,237,1,70,2,176,2,81,2,218,1,185,2,219,1,176,2,165,1,199,1,43,2,249,1,55,2,12,2,73,2,207,4,253,1,60,3,236,1,4,6,55,4,82,3,8,0,4,0,3,0,14,0,7,0,5,0,24,0,21,0,24,0,57,0,48,0,57,0,8,0,4,0,3,0,14,0,7,0,5,0,37,0,32,0,37,0,100,0,80,0,100,0,6,0,3,0,2,0,9,0,5,0,3,0,82,0,78,0,82,0,29,1,4,1,29,1,6,0,3,0,2,0,9,0,5,0,3,0,94,0,94,0,94,0,76,4,26,4,76,4,34,0,62,0,72,0,66,0,53,0,25,0,94,0,66,0,56,0,62,0,75,0,103,0,48,0,82,0,45,0,87,0,50,0,47,0,80,0,46,0,83,0,41,0,78,0,81,0,6,0,8,0,10,0,12,0,14,0,16,0,128,2,0,3,32,2,32,2,64,2,64,2,64,2,64,2,128,44,128,44,0,45,0,45,0,45,0,45,0,36,128,35,0,35,128,34,0,34,128,33,112,1,112,1,16,1,176,0,176,0,176,0,231,25,50,204,231,25,0,64,180,225,244,21,236,81,195,21,123,20,112,5,10,3,254,247,63,4,245,90,103,50,57,241,185,1,222,0,222,0,185,1,57,241,103,50,245,90,63,4,254,247,10,3,53,3,222,23,94,48,234,11,152,36,215,58,0,0,201,0,146,1,91,2,36,3,237,3,182,4,126,5,71,6,16,7,217,7,161,8,106,9,50,10,251,10,195,11,139,12,83,13,27,14,227,14,171,15,114,16,57,17,0,18,199,18,142,19,85,20,27,21,225,21,167,22,109,23,51,24,248,24,189,25,130,26,70,27,11,28,207,28,147,29,86,30,25,31,220,31,159,32,97,33,35,34,228,34,166,35,103,36,39,37,231,37,167,38,103,39,38,40,229,40,163,41,97,42,30,43,219,43,152,44,84,45,16,46,204,46,134,47,65,48,251,48,180,49,109,50,38,51,222,51,150,52,77,53,3,54,185,54,111,55,36,56,216,56,140,57,63,58,242,58,164,59,86,60,7,61,183,61,103,62,22,63,197,63,115,64,32,65,205,65,121,66,37,67,208,67,122,68,35,69,204,69,116,70,28,71,195,71,105,72,14,73,179,73,87,74,250,74,157,75,63,76,224,76,128,77,32,78,191,78,93,79,250,79,151,80,51,81,206,81,104,82,1,83,154,83,50,84,201,84,95,85,244,85,137,86,29,87,176,87,66,88,211,88,99,89,243,89,129,90,15,91,156,91,40,92,179,92,61,93,198,93,79,94,214,94,93,95,226,95,103,96,235,96,110,97,240,97,113,98,241,98,112,99,238,99,107,100,231,100,98,101,221,101,86,102,206,102,69,103,188,103,49,104,165,104,25,105,139,105,252,105,108,106,219,106,74,107,183,107,35,108,142,108,248,108,97,109,201,109,48,110,149,110,250,110,94,111,192,111,34,112,130,112,225,112,64,113,157,113,249,113,84,114,174,114,6,115,94,115,181,115,10,116,94,116,177,116,3,117,84,117,164,117,243,117,64,118,141,118,216,118,34,119,107,119,179,119,249,119,63,120,131,120,198,120,8,121,73,121,137,121,199,121,4,122,65,122,124,122,181,122,238,122,37,123,92,123,145,123,196,123,247,123,41,124,89,124,136,124,182,124,226,124,14,125,56,125,97,125,137,125,176,125,213,125,249,125,28,126,62,126,94,126,126,126,156,126,185,126,212,126,239,126,8,127,32,127,55,127,76,127,97,127,116,127,134,127,150,127,166,127,180,127,193,127,205,127,215,127,224,127,232,127,239,127,245,127,249,127,252,127,254,127,255,127,254,127,252,127,249,127,245,127,239,127,232,127,224,127,215,127,205,127,193,127,180,127,166,127,150,127,134,127,116,127,97,127,76,127,55,127,32,127,8,127,239,126,212,126,185,126,156,126,126,126,94,126,62,126,28,126,249,125,213,125,176,125,137,125,97,125,56,125,14,125,226,124,182,124,136,124,89,124,41,124,247,123,196,123,145,123,92,123,37,123,238,122,181,122,124,122,65,122,4,122,199,121,137,121,73,121,8,121,198,120,131,120,63,120,249,119,179,119,107,119,34,119,216,118,141,118,64,118,243,117,164,117,84,117,3,117,177,116,94,116,10,116,181,115,94,115,6,115,174,114,84,114,249,113,157,113,64,113,225,112,130,112,34,112,192,111,94,111,250,110,149,110,48,110,201,109,97,109,248,108,142,108,35,108,183,107,74,107,219,106,108,106,252,105,139,105,25,105,165,104,49,104,188,103,69,103,206,102,86,102,221,101,98,101,231,100,107,100,238,99,112,99,241,98,113,98,240,97,110,97,235,96,103,96,226,95,93,95,214,94,79,94,198,93,61,93,179,92,40,92,156,91,15,91,129,90,243,89,99,89,211,88,66,88,176,87,29,87,137,86,244,85,95,85,201,84,50,84,154,83,1,83,104,82,206,81,51,81,151,80,250,79,93,79,191,78,32,78,128,77,224,76,63,76,157,75,250,74,87,74,179,73,14,73,105,72,195,71,28,71,116,70,204,69,35,69,122,68,208,67,37,67,121,66,205,65,32,65,115,64,197,63,22,63,103,62,183,61,7,61,86,60,164,59,242,58,63,58,140,57,216,56,36,56,111,55,185,54,3,54,77,53,150,52,222,51,38,51,109,50,180,49,251,48,65,48,134,47,204,46,16,46,84,45,152,44,219,43,30,43,97,42,163,41,229,40,38,40,103,39,167,38,231,37,39,37,103,36,166,35,228,34,35,34,97,33,159,32,220,31,25,31,86,30,147,29,207,28,11,28,70,27,130,26,189,25,248,24,51,24,109,23,167,22,225,21,27,21,85,20,142,19,199,18,0,18,57,17,114,16,171,15,227,14,27,14,83,13,139,12,195,11,251,10,50,10,106,9,161,8,217,7,16,7,71,6,126,5,182,4,237,3,36,3,91,2,146,1,201,0,0,0,55,255,110,254,165,253,220,252,19,252,74,251,130,250,185,249,240,248,39,248,95,247,150,246,206,245,5,245,61,244,117,243,173,242,229,241,29,241,85,240,142,239,199,238,0,238,57,237,114,236,171,235,229,234,31,234,89,233,147,232,205,231,8,231,67,230,126,229,186,228,245,227,49,227,109,226,170,225,231,224,36,224,97,223,159,222,221,221,28,221,90,220,153,219,217,218,25,218,89,217,153,216,218,215,27,215,93,214,159,213,226,212,37,212,104,211,172,210,240,209,52,209,122,208,191,207,5,207,76,206,147,205,218,204,34,204,106,203,179,202,253,201,71,201,145,200,220,199,40,199,116,198,193,197,14,197,92,196,170,195,249,194,73,194,153,193,234,192,59,192,141,191,224,190,51,190,135,189,219,188,48,188,134,187,221,186,52,186,140,185,228,184,61,184,151,183,242,182,77,182,169,181,6,181,99,180,193,179,32,179,128,178,224,177,65,177,163,176,6,176,105,175,205,174,50,174,152,173,255,172,102,172,206,171,55,171,161,170,12,170,119,169,227,168,80,168,190,167,45,167,157,166,13,166,127,165,241,164,100,164,216,163,77,163,195,162,58,162,177,161,42,161,163,160,30,160,153,159,21,159,146,158,16,158,143,157,15,157,144,156,18,156,149,155,25,155,158,154,35,154,170,153,50,153,187,152,68,152,207,151,91,151,231,150,117,150,4,150,148,149,37,149,182,148,73,148,221,147,114,147,8,147,159,146,55,146,208,145,107,145,6,145,162,144,64,144,222,143,126,143,31,143,192,142,99,142,7,142,172,141,82,141,250,140,162,140,75,140,246,139,162,139,79,139,253,138,172,138,92,138,13,138,192,137,115,137,40,137,222,136,149,136,77,136,7,136,193,135,125,135,58,135,248,134,183,134,119,134,57,134,252,133,191,133,132,133,75,133,18,133,219,132,164,132,111,132,60,132,9,132,215,131,167,131,120,131,74,131,30,131,242,130,200,130,159,130,119,130,80,130,43,130,7,130,228,129,194,129,162,129,130,129,100,129,71,129,44,129,17,129,248,128,224,128,201,128,180,128,159,128,140,128,122,128,106,128,90,128,76,128,63,128,51,128,41,128,32,128,24,128,17,128,11,128,7,128,4,128,2,128,1,128,2,128,4,128,7,128,11,128,17,128,24,128,32,128,41,128,51,128,63,128,76,128,90,128,106,128,122,128,140,128,159,128,180,128,201,128,224,128,248,128,17,129,44,129,71,129,100,129,130,129,162,129,194,129,228,129,7,130,43,130,80,130,119,130,159,130,200,130,242,130,30,131,74,131,120,131,167,131,215,131,9,132,60,132,111,132,164,132,219,132,18,133,75,133,132,133,191,133,252,133,57,134,119,134,183,134,248,134,58,135,125,135,193,135,7,136,77,136,149,136,222,136,40,137,115,137,192,137,13,138,92,138,172,138,253,138,79,139,162,139,246,139,75,140,162,140,250,140,82,141,172,141,7,142,99,142,192,142,31,143,126,143,222,143,64,144,162,144,6,145,107,145,208,145,55,146,159,146,8,147,114,147,221,147,73,148,182,148,37,149,148,149,4,150,117,150,231,150,91,151,207,151,68,152,187,152,50,153,170,153,35,154,158,154,25,155,149,155,18,156,144,156,15,157,143,157,16,158,146,158,21,159,153,159,30,160,163,160,42,161,177,161,58,162,195,162,77,163,216,163,100,164,241,164,127,165,13,166,157,166,45,167,190,167,80,168,227,168,119,169,12,170,161,170,55,171,206,171,102,172,255,172,152,173,50,174,205,174,105,175,6,176,163,176,65,177,224,177,128,178,32,179,193,179,99,180,6,181,169,181,77,182,242,182,151,183,61,184,228,184,140,185,52,186,221,186,134,187,48,188,219,188,135,189,51,190,224,190,141,191,59,192,234,192,153,193,73,194,249,194,170,195,92,196,14,197,193,197,116,198,40,199,220,199,145,200,71,201,253,201,179,202,106,203,34,204,218,204,147,205,76,206,5,207,191,207,122,208,52,209,240,209,172,210,104,211,37,212,226,212,159,213,93,214,27,215,218,215,153,216,89,217,25,218,217,218,153,219,90,220,28,221,221,221,159,222,97,223,36,224,231,224,170,225,109,226,49,227,245,227,186,228,126,229,67,230,8,231,205,231,147,232,89,233,31,234,229,234,171,235,114,236,57,237,0,238,199,238,142,239,85,240,29,241,229,241,173,242,117,243,61,244,5,245,206,245,150,246,95,247,39,248,240,248,185,249,130,250,74,251,19,252,220,252,165,253,110,254,55,255,1,0,64,0,2,0,32,0,3,0,96,0,4,0,16,0,5,0,80,0,6,0,48,0,7,0,112,0,9,0,72,0,10,0,40,0,11,0,104,0,12,0,24,0,13,0,88,0,14,0,56,0,15,0,120,0,17,0,68,0,18,0,36,0,19,0,100,0,21,0,84,0,22,0,52,0,23,0,116,0,25,0,76,0,26,0,44,0,27,0,108,0,29,0,92,0,30,0,60,0,31,0,124,0,33,0,66,0,35,0,98,0,37,0,82,0,38,0,50,0,39,0,114,0,41,0,74,0,43,0,106,0,45,0,90,0,46,0,58,0,47,0,122,0,49,0,70,0,51,0,102,0,53,0,86,0,55,0,118,0,57,0,78,0,59,0,110,0,61,0,94,0,63,0,126,0,67,0,97,0,69,0,81,0,71,0,113,0,75,0,105,0,77,0,89,0,79,0,121,0,83,0,101,0,87,0,117,0,91,0,109,0,95,0,125,0,103,0,115,0,111,0,123,0,1,0,128,0,2,0,64,0,3,0,192,0,4,0,32,0,5,0,160,0,6,0,96,0,7,0,224,0,8,0,16,0,9,0,144,0,10,0,80,0,11,0,208,0,12,0,48,0,13,0,176,0,14,0,112,0,15,0,240,0,17,0,136,0,18,0,72,0,19,0,200,0,20,0,40,0,21,0,168,0,22,0,104,0,23,0,232,0,25,0,152,0,26,0,88,0,27,0,216,0,28,0,56,0,29,0,184,0,30,0,120,0,31,0,248,0,33,0,132,0,34,0,68,0,35,0,196,0,37,0,164,0,38,0,100,0,39,0,228,0,41,0,148,0,42,0,84,0,43,0,212,0,44,0,52,0,45,0,180,0,46,0,116,0,47,0,244,0,49,0,140,0,50,0,76,0,51,0,204,0,53,0,172,0,54,0,108,0,55,0,236,0,57,0,156,0,58,0,92,0,59,0,220,0,61,0,188,0,62,0,124,0,63,0,252,0,65,0,130,0,67,0,194,0,69,0,162,0,70,0,98,0,71,0,226,0,73,0,146,0,74,0,82,0,75,0,210,0,77,0,178,0,78,0,114,0,79,0,242,0,81,0,138,0,83,0,202,0,85,0,170,0,86,0,106,0,87,0,234,0,89,0,154,0,91,0,218,0,93,0,186,0,94,0,122,0,95,0,250,0,97,0,134,0,99,0,198,0,101,0,166,0,103,0,230,0,105,0,150,0,107,0,214,0,109,0,182,0,110,0,118,0,111,0,246,0,113,0,142,0,115,0,206,0,117,0,174,0,119,0,238,0,121,0,158,0,123,0,222,0,125,0,190,0,127,0,254,0,131,0,193,0,133,0,161,0,135,0,225,0,137,0,145,0,139,0,209,0,141,0,177,0,143,0,241,0,147,0,201,0,149,0,169,0,151,0,233,0,155,0,217,0,157,0,185,0,159,0,249,0,163,0,197,0,167,0,229,0,171,0,213,0,173,0,181,0,175,0,245,0,179,0,205,0,183,0,237,0,187,0,221,0,191,0,253,0,199,0,227,0,203,0,211,0,207,0,243,0,215,0,235,0,223,0,251,0,239,0,247,0,112,114,111,99,101,115,115,95,100,97,116,97,58,32,100,97,116,97,32,61,61,32,78,85,76,76,32,10,0,100,97,116,97,91,48,93,32,61,61,32,118,97,108,48,0,109,97,105,110,46,99,0,112,114,111,99,101,115,115,95,100,97,116,97,0,100,97,116,97,91,49,48,48,93,32,61,61,32,118,97,108,49,48,48,0,100,97,116,97,91,50,48,48,48,93,32,61,61,32,118,97,108,50,48,48,48,0,100,97,116,97,95,108,101,110,103,116,104,32,62,61,32,48,0,119,101,98,114,116,99,47,99,111,109,109,111,110,95,97,117,100,105,111,47,118,97,100,47,118,97,100,95,102,105,108,116,101,114,98,97,110,107,46,99,0,87,101,98,82,116,99,86,97,100,95,67,97,108,99,117,108,97,116,101,70,101,97,116,117,114,101,115,0,100,97,116,97,95,108,101,110,103,116,104,32,60,61,32,50,52,48,0,100,97,116,97,95,105,110,32,33,61,32,78,85,76,76,0,76,111,103,79,102,69,110,101,114,103,121,0,100,97,116,97,95,108,101,110,103,116,104,32,62,32,48,0,99,104,97,110,110,101,108,32,60,32,107,78,117,109,67,104,97,110,110,101,108,115,0,119,101,98,114,116,99,47,99,111,109,109,111,110,95,97,117,100,105,111,47,118,97,100,47,118,97,100,95,115,112,46,99,0,87,101,98,82,116,99,86,97,100,95,70,105,110,100,77,105,110,105,109,117,109,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,45,43,32,32,32,48,88,48,120,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,46,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


   
  Module["_i64Subtract"] = _i64Subtract;

   
  Module["_i64Add"] = _i64Add;

   
  Module["_memset"] = _memset;

   
  Module["_bitshift64Lshr"] = _bitshift64Lshr;

   
  Module["_bitshift64Shl"] = _bitshift64Shl;

  function _abort() {
      Module['abort']();
    }

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Module['dynCall_v'](func);
      _pthread_once.seen[ptr] = 1;
    }

  function ___lock() {}

  function ___unlock() {}

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC); 
  Module["_llvm_cttz_i32"] = _llvm_cttz_i32; 
  Module["___udivmoddi4"] = ___udivmoddi4; 
  Module["___udivdi3"] = ___udivdi3;

  function ___assert_fail(condition, filename, line, func) {
      ABORT = true;
      throw 'Assertion failed: ' + Pointer_stringify(condition) + ', at: ' + [filename ? Pointer_stringify(filename) : 'unknown filename', line, func ? Pointer_stringify(func) : 'unknown function'] + ' at ' + stackTrace();
    }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
  Module["_sbrk"] = _sbrk;

   
  Module["___uremdi3"] = ___uremdi3;

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

   
  Module["_llvm_bswap_i32"] = _llvm_bswap_i32;

  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");



function nullFunc_iiiiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_iiiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  try {
    return Module["dynCall_iiiiiiii"](index,a1,a2,a3,a4,a5,a6,a7);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  try {
    Module["dynCall_viiiiiii"](index,a1,a2,a3,a4,a5,a6,a7);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8) {
  try {
    return Module["dynCall_iiiiiiiii"](index,a1,a2,a3,a4,a5,a6,a7,a8);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_iiiiiiii": nullFunc_iiiiiiii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_vi": nullFunc_vi, "nullFunc_ii": nullFunc_ii, "nullFunc_viiiiiii": nullFunc_viiiiiii, "nullFunc_v": nullFunc_v, "nullFunc_iiiiiiiii": nullFunc_iiiiiiiii, "nullFunc_iii": nullFunc_iii, "invoke_iiiiiiii": invoke_iiiiiiii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_ii": invoke_ii, "invoke_viiiiiii": invoke_viiiiiii, "invoke_v": invoke_v, "invoke_iiiiiiiii": invoke_iiiiiiiii, "invoke_iii": invoke_iii, "___lock": ___lock, "_abort": _abort, "_pthread_once": _pthread_once, "___syscall6": ___syscall6, "___syscall140": ___syscall140, "___setErrNo": ___setErrNo, "_emscripten_memcpy_big": _emscripten_memcpy_big, "___syscall54": ___syscall54, "___unlock": ___unlock, "___assert_fail": ___assert_fail, "___syscall146": ___syscall146, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'almost asm';
  
  
  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);


  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntP = 0, tempBigIntS = 0, tempBigIntR = 0.0, tempBigIntI = 0, tempBigIntD = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_iiiiiiii=env.nullFunc_iiiiiiii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_viiiiiii=env.nullFunc_viiiiiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_iiiiiiiii=env.nullFunc_iiiiiiiii;
  var nullFunc_iii=env.nullFunc_iii;
  var invoke_iiiiiiii=env.invoke_iiiiiiii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_vi=env.invoke_vi;
  var invoke_ii=env.invoke_ii;
  var invoke_viiiiiii=env.invoke_viiiiiii;
  var invoke_v=env.invoke_v;
  var invoke_iiiiiiiii=env.invoke_iiiiiiiii;
  var invoke_iii=env.invoke_iii;
  var ___lock=env.___lock;
  var _abort=env._abort;
  var _pthread_once=env._pthread_once;
  var ___syscall6=env.___syscall6;
  var ___syscall140=env.___syscall140;
  var ___setErrNo=env.___setErrNo;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var ___assert_fail=env.___assert_fail;
  var ___syscall146=env.___syscall146;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function _main() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $0 = 0;
 $1 = 0;
 $2 = (_WebRtcVad_Create(6280)|0);
 $1 = $2;
 $3 = $1;
 $4 = ($3|0)==(-1);
 do {
  if ($4) {
   $0 = 0;
  } else {
   $5 = HEAP32[1570]|0;
   $6 = (_WebRtcVad_Init($5)|0);
   $1 = $6;
   $7 = $1;
   $8 = ($7|0)==(-1);
   if ($8) {
    $0 = 0;
    break;
   } else {
    $0 = 1;
    break;
   }
  }
 } while(0);
 $9 = $0;
 STACKTOP = sp;return ($9|0);
}
function _setmode($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = HEAP32[1570]|0;
 $3 = $1;
 $4 = (_WebRtcVad_set_mode($2,$3)|0);
 STACKTOP = sp;return ($4|0);
}
function _process_data($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $6 = $0;
 $7 = $1;
 $8 = $2;
 $9 = $3;
 $10 = $4;
 $11 = $5;
 $12 = $6;
 $13 = ($12|0)==(0|0);
 if ($13) {
  (_printf(3520,$vararg_buffer)|0);
 }
 $14 = $6;
 $15 = HEAP16[$14>>1]|0;
 $16 = $15 << 16 >> 16;
 $17 = $9;
 $18 = ($16|0)==($17|0);
 if (!($18)) {
  ___assert_fail((3549|0),(3565|0),30,(3572|0));
  // unreachable;
 }
 $19 = $6;
 $20 = ((($19)) + 200|0);
 $21 = HEAP16[$20>>1]|0;
 $22 = $21 << 16 >> 16;
 $23 = $10;
 $24 = ($22|0)==($23|0);
 if (!($24)) {
  ___assert_fail((3585|0),(3565|0),31,(3572|0));
  // unreachable;
 }
 $25 = $6;
 $26 = ((($25)) + 4000|0);
 $27 = HEAP16[$26>>1]|0;
 $28 = $27 << 16 >> 16;
 $29 = $11;
 $30 = ($28|0)==($29|0);
 if ($30) {
  $31 = HEAP32[1570]|0;
  $32 = $8;
  $33 = $6;
  $34 = $7;
  $35 = (_WebRtcVad_Process($31,$32,$33,$34)|0);
  STACKTOP = sp;return ($35|0);
 } else {
  ___assert_fail((3605|0),(3565|0),32,(3572|0));
  // unreachable;
 }
 return (0)|0;
}
function _WebRtcVad_Create($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = 0;
 $4 = $2;
 $5 = ($4|0)==(0|0);
 do {
  if ($5) {
   $1 = -1;
  } else {
   $6 = $2;
   HEAP32[$6>>2] = 0;
   $7 = (_malloc(736)|0);
   $3 = $7;
   $8 = $3;
   $9 = $2;
   HEAP32[$9>>2] = $8;
   $10 = $3;
   $11 = ($10|0)==(0|0);
   if ($11) {
    $1 = -1;
    break;
   } else {
    _WebRtcSpl_Init();
    $12 = $3;
    $13 = ((($12)) + 732|0);
    HEAP32[$13>>2] = 0;
    $1 = 0;
    break;
   }
  }
 } while(0);
 $14 = $1;
 STACKTOP = sp;return ($14|0);
}
function _WebRtcVad_Init($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (_WebRtcVad_InitCore($2)|0);
 STACKTOP = sp;return ($3|0);
}
function _WebRtcVad_set_mode($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $6 = $3;
 $5 = $6;
 $7 = $3;
 $8 = ($7|0)==(0|0);
 do {
  if ($8) {
   $2 = -1;
  } else {
   $9 = $5;
   $10 = ((($9)) + 732|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)!=(42);
   if ($12) {
    $2 = -1;
    break;
   } else {
    $13 = $5;
    $14 = $4;
    $15 = (_WebRtcVad_set_mode_core($13,$14)|0);
    $2 = $15;
    break;
   }
  }
 } while(0);
 $16 = $2;
 STACKTOP = sp;return ($16|0);
}
function _WebRtcVad_Process($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = -1;
 $11 = $5;
 $10 = $11;
 $12 = $5;
 $13 = ($12|0)==(0|0);
 if ($13) {
  $4 = -1;
  $51 = $4;
  STACKTOP = sp;return ($51|0);
 }
 $14 = $10;
 $15 = ((($14)) + 732|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ($16|0)!=(42);
 if ($17) {
  $4 = -1;
  $51 = $4;
  STACKTOP = sp;return ($51|0);
 }
 $18 = $7;
 $19 = ($18|0)==(0|0);
 if ($19) {
  $4 = -1;
  $51 = $4;
  STACKTOP = sp;return ($51|0);
 }
 $20 = $6;
 $21 = $8;
 $22 = (_WebRtcVad_ValidRateAndFrameLength($20,$21)|0);
 $23 = ($22|0)!=(0);
 if ($23) {
  $4 = -1;
  $51 = $4;
  STACKTOP = sp;return ($51|0);
 }
 $24 = $6;
 $25 = ($24|0)==(48000);
 do {
  if ($25) {
   $26 = $10;
   $27 = $7;
   $28 = $8;
   $29 = (_WebRtcVad_CalcVad48khz($26,$27,$28)|0);
   $9 = $29;
  } else {
   $30 = $6;
   $31 = ($30|0)==(32000);
   if ($31) {
    $32 = $10;
    $33 = $7;
    $34 = $8;
    $35 = (_WebRtcVad_CalcVad32khz($32,$33,$34)|0);
    $9 = $35;
    break;
   }
   $36 = $6;
   $37 = ($36|0)==(16000);
   if ($37) {
    $38 = $10;
    $39 = $7;
    $40 = $8;
    $41 = (_WebRtcVad_CalcVad16khz($38,$39,$40)|0);
    $9 = $41;
    break;
   }
   $42 = $6;
   $43 = ($42|0)==(8000);
   if ($43) {
    $44 = $10;
    $45 = $7;
    $46 = $8;
    $47 = (_WebRtcVad_CalcVad8khz($44,$45,$46)|0);
    $9 = $47;
   }
  }
 } while(0);
 $48 = $9;
 $49 = ($48|0)>(0);
 if ($49) {
  $9 = 1;
 }
 $50 = $9;
 $4 = $50;
 $51 = $4;
 STACKTOP = sp;return ($51|0);
}
function _WebRtcVad_ValidRateAndFrameLength($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = $0;
 $3 = $1;
 $4 = -1;
 $5 = 0;
 while(1) {
  $8 = $5;
  $9 = ($8>>>0)<(4);
  if (!($9)) {
   label = 10;
   break;
  }
  $10 = $5;
  $11 = (8 + ($10<<2)|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = $2;
  $14 = ($12|0)==($13|0);
  if ($14) {
   break;
  }
  $28 = $5;
  $29 = (($28) + 1)|0;
  $5 = $29;
 }
 if ((label|0) == 10) {
  $30 = $4;
  STACKTOP = sp;return ($30|0);
 }
 $6 = 10;
 while(1) {
  $15 = $6;
  $16 = ($15|0)<=(30);
  if (!($16)) {
   label = 10;
   break;
  }
  $17 = $5;
  $18 = (8 + ($17<<2)|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = (($19|0) / 1000)&-1;
  $21 = $6;
  $22 = Math_imul($20, $21)|0;
  $7 = $22;
  $23 = $3;
  $24 = $7;
  $25 = ($23|0)==($24|0);
  if ($25) {
   break;
  }
  $26 = $6;
  $27 = (($26) + 10)|0;
  $6 = $27;
 }
 if ((label|0) == 10) {
  $30 = $4;
  STACKTOP = sp;return ($30|0);
 }
 $4 = 0;
 $30 = $4;
 STACKTOP = sp;return ($30|0);
}
function _WebRtcVad_InitCore($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $2;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $1 = -1;
  $78 = $1;
  STACKTOP = sp;return ($78|0);
 }
 $6 = $2;
 HEAP32[$6>>2] = 1;
 $7 = $2;
 $8 = ((($7)) + 276|0);
 HEAP32[$8>>2] = 0;
 $9 = $2;
 $10 = ((($9)) + 280|0);
 HEAP16[$10>>1] = 0;
 $11 = $2;
 $12 = ((($11)) + 282|0);
 HEAP16[$12>>1] = 0;
 $13 = $2;
 $14 = ((($13)) + 4|0);
 ;HEAP32[$14>>2]=0|0;HEAP32[$14+4>>2]=0|0;HEAP32[$14+8>>2]=0|0;HEAP32[$14+12>>2]=0|0;
 $15 = $2;
 $16 = ((($15)) + 20|0);
 _WebRtcSpl_ResetResample48khzTo8khz($16);
 $3 = 0;
 while(1) {
  $17 = $3;
  $18 = ($17|0)<(12);
  if (!($18)) {
   break;
  }
  $19 = $3;
  $20 = (400 + ($19<<1)|0);
  $21 = HEAP16[$20>>1]|0;
  $22 = $2;
  $23 = ((($22)) + 180|0);
  $24 = $3;
  $25 = (($23) + ($24<<1)|0);
  HEAP16[$25>>1] = $21;
  $26 = $3;
  $27 = (424 + ($26<<1)|0);
  $28 = HEAP16[$27>>1]|0;
  $29 = $2;
  $30 = ((($29)) + 204|0);
  $31 = $3;
  $32 = (($30) + ($31<<1)|0);
  HEAP16[$32>>1] = $28;
  $33 = $3;
  $34 = (448 + ($33<<1)|0);
  $35 = HEAP16[$34>>1]|0;
  $36 = $2;
  $37 = ((($36)) + 228|0);
  $38 = $3;
  $39 = (($37) + ($38<<1)|0);
  HEAP16[$39>>1] = $35;
  $40 = $3;
  $41 = (472 + ($40<<1)|0);
  $42 = HEAP16[$41>>1]|0;
  $43 = $2;
  $44 = ((($43)) + 252|0);
  $45 = $3;
  $46 = (($44) + ($45<<1)|0);
  HEAP16[$46>>1] = $42;
  $47 = $3;
  $48 = (($47) + 1)|0;
  $3 = $48;
 }
 $3 = 0;
 while(1) {
  $49 = $3;
  $50 = ($49|0)<(96);
  $51 = $2;
  if (!($50)) {
   break;
  }
  $52 = ((($51)) + 476|0);
  $53 = $3;
  $54 = (($52) + ($53<<1)|0);
  HEAP16[$54>>1] = 10000;
  $55 = $2;
  $56 = ((($55)) + 284|0);
  $57 = $3;
  $58 = (($56) + ($57<<1)|0);
  HEAP16[$58>>1] = 0;
  $59 = $3;
  $60 = (($59) + 1)|0;
  $3 = $60;
 }
 $61 = ((($51)) + 680|0);
 ;HEAP32[$61>>2]=0|0;HEAP32[$61+4>>2]=0|0;HEAP16[$61+8>>1]=0|0;
 $62 = $2;
 $63 = ((($62)) + 690|0);
 ;HEAP16[$63>>1]=0|0;HEAP16[$63+2>>1]=0|0;HEAP16[$63+4>>1]=0|0;HEAP16[$63+6>>1]=0|0;HEAP16[$63+8>>1]=0|0;
 $64 = $2;
 $65 = ((($64)) + 700|0);
 ;HEAP32[$65>>2]=0|0;HEAP32[$65+4>>2]=0|0;
 $3 = 0;
 while(1) {
  $66 = $3;
  $67 = ($66|0)<(6);
  $68 = $2;
  if (!($67)) {
   break;
  }
  $69 = ((($68)) + 668|0);
  $70 = $3;
  $71 = (($69) + ($70<<1)|0);
  HEAP16[$71>>1] = 1600;
  $72 = $3;
  $73 = (($72) + 1)|0;
  $3 = $73;
 }
 $74 = (_WebRtcVad_set_mode_core($68,0)|0);
 $75 = ($74|0)!=(0);
 if ($75) {
  $1 = -1;
  $78 = $1;
  STACKTOP = sp;return ($78|0);
 } else {
  $76 = $2;
  $77 = ((($76)) + 732|0);
  HEAP32[$77>>2] = 42;
  $1 = 0;
  $78 = $1;
  STACKTOP = sp;return ($78|0);
 }
 return (0)|0;
}
function _WebRtcVad_set_mode_core($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = 0;
 $5 = $3;
 switch ($5|0) {
 case 0:  {
  $6 = $2;
  $7 = ((($6)) + 708|0);
  ;HEAP16[$7>>1]=HEAP16[496>>1]|0;HEAP16[$7+2>>1]=HEAP16[496+2>>1]|0;HEAP16[$7+4>>1]=HEAP16[496+4>>1]|0;
  $8 = $2;
  $9 = ((($8)) + 714|0);
  ;HEAP16[$9>>1]=HEAP16[502>>1]|0;HEAP16[$9+2>>1]=HEAP16[502+2>>1]|0;HEAP16[$9+4>>1]=HEAP16[502+4>>1]|0;
  $10 = $2;
  $11 = ((($10)) + 720|0);
  ;HEAP16[$11>>1]=HEAP16[508>>1]|0;HEAP16[$11+2>>1]=HEAP16[508+2>>1]|0;HEAP16[$11+4>>1]=HEAP16[508+4>>1]|0;
  $12 = $2;
  $13 = ((($12)) + 726|0);
  ;HEAP16[$13>>1]=HEAP16[514>>1]|0;HEAP16[$13+2>>1]=HEAP16[514+2>>1]|0;HEAP16[$13+4>>1]=HEAP16[514+4>>1]|0;
  $38 = $4;
  STACKTOP = sp;return ($38|0);
  break;
 }
 case 1:  {
  $14 = $2;
  $15 = ((($14)) + 708|0);
  ;HEAP16[$15>>1]=HEAP16[520>>1]|0;HEAP16[$15+2>>1]=HEAP16[520+2>>1]|0;HEAP16[$15+4>>1]=HEAP16[520+4>>1]|0;
  $16 = $2;
  $17 = ((($16)) + 714|0);
  ;HEAP16[$17>>1]=HEAP16[526>>1]|0;HEAP16[$17+2>>1]=HEAP16[526+2>>1]|0;HEAP16[$17+4>>1]=HEAP16[526+4>>1]|0;
  $18 = $2;
  $19 = ((($18)) + 720|0);
  ;HEAP16[$19>>1]=HEAP16[532>>1]|0;HEAP16[$19+2>>1]=HEAP16[532+2>>1]|0;HEAP16[$19+4>>1]=HEAP16[532+4>>1]|0;
  $20 = $2;
  $21 = ((($20)) + 726|0);
  ;HEAP16[$21>>1]=HEAP16[538>>1]|0;HEAP16[$21+2>>1]=HEAP16[538+2>>1]|0;HEAP16[$21+4>>1]=HEAP16[538+4>>1]|0;
  $38 = $4;
  STACKTOP = sp;return ($38|0);
  break;
 }
 case 2:  {
  $22 = $2;
  $23 = ((($22)) + 708|0);
  ;HEAP16[$23>>1]=HEAP16[544>>1]|0;HEAP16[$23+2>>1]=HEAP16[544+2>>1]|0;HEAP16[$23+4>>1]=HEAP16[544+4>>1]|0;
  $24 = $2;
  $25 = ((($24)) + 714|0);
  ;HEAP16[$25>>1]=HEAP16[550>>1]|0;HEAP16[$25+2>>1]=HEAP16[550+2>>1]|0;HEAP16[$25+4>>1]=HEAP16[550+4>>1]|0;
  $26 = $2;
  $27 = ((($26)) + 720|0);
  ;HEAP16[$27>>1]=HEAP16[556>>1]|0;HEAP16[$27+2>>1]=HEAP16[556+2>>1]|0;HEAP16[$27+4>>1]=HEAP16[556+4>>1]|0;
  $28 = $2;
  $29 = ((($28)) + 726|0);
  ;HEAP16[$29>>1]=HEAP16[562>>1]|0;HEAP16[$29+2>>1]=HEAP16[562+2>>1]|0;HEAP16[$29+4>>1]=HEAP16[562+4>>1]|0;
  $38 = $4;
  STACKTOP = sp;return ($38|0);
  break;
 }
 case 3:  {
  $30 = $2;
  $31 = ((($30)) + 708|0);
  ;HEAP16[$31>>1]=HEAP16[568>>1]|0;HEAP16[$31+2>>1]=HEAP16[568+2>>1]|0;HEAP16[$31+4>>1]=HEAP16[568+4>>1]|0;
  $32 = $2;
  $33 = ((($32)) + 714|0);
  ;HEAP16[$33>>1]=HEAP16[574>>1]|0;HEAP16[$33+2>>1]=HEAP16[574+2>>1]|0;HEAP16[$33+4>>1]=HEAP16[574+4>>1]|0;
  $34 = $2;
  $35 = ((($34)) + 720|0);
  ;HEAP16[$35>>1]=HEAP16[580>>1]|0;HEAP16[$35+2>>1]=HEAP16[580+2>>1]|0;HEAP16[$35+4>>1]=HEAP16[580+4>>1]|0;
  $36 = $2;
  $37 = ((($36)) + 726|0);
  ;HEAP16[$37>>1]=HEAP16[586>>1]|0;HEAP16[$37+2>>1]=HEAP16[586+2>>1]|0;HEAP16[$37+4>>1]=HEAP16[586+4>>1]|0;
  $38 = $4;
  STACKTOP = sp;return ($38|0);
  break;
 }
 default: {
  $4 = -1;
  $38 = $4;
  STACKTOP = sp;return ($38|0);
 }
 }
 return (0)|0;
}
function _WebRtcVad_CalcVad48khz($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 3472|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(3472|0);
 $8 = sp + 2984|0;
 $9 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 _memset(($9|0),0,2944)|0;
 $10 = 480;
 $11 = 80;
 $13 = $5;
 $14 = (($13|0) / 480)&-1;
 $12 = $14;
 $7 = 0;
 while(1) {
  $15 = $7;
  $16 = $12;
  $17 = ($15|0)<($16|0);
  if (!($17)) {
   break;
  }
  $18 = $4;
  $19 = $7;
  $20 = ($19*80)|0;
  $21 = (($8) + ($20<<1)|0);
  $22 = $3;
  $23 = ((($22)) + 20|0);
  _WebRtcSpl_Resample48khzTo8khz($18,$21,$23,$9);
  $24 = $7;
  $25 = (($24) + 1)|0;
  $7 = $25;
 }
 $26 = $3;
 $27 = $5;
 $28 = (($27|0) / 6)&-1;
 $29 = (_WebRtcVad_CalcVad8khz($26,$8,$28)|0);
 $6 = $29;
 $30 = $6;
 STACKTOP = sp;return ($30|0);
}
function _WebRtcVad_CalcVad8khz($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $6 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $8 = $3;
 $9 = $4;
 $10 = $5;
 $11 = (_WebRtcVad_CalculateFeatures($8,$9,$10,$6)|0);
 $7 = $11;
 $12 = $3;
 $13 = $7;
 $14 = $5;
 $15 = (_GmmProbability($12,$6,$13,$14)|0);
 $16 = $15 << 16 >> 16;
 $17 = $3;
 HEAP32[$17>>2] = $16;
 $18 = $3;
 $19 = HEAP32[$18>>2]|0;
 STACKTOP = sp;return ($19|0);
}
function _GmmProbability($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $$3 = 0, $$sink = 0, $$sink2 = 0, $$sink4 = 0, $$sink6 = 0, $$sink7 = 0, $$sink8 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0;
 var $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0;
 var $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0;
 var $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0;
 var $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0;
 var $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0;
 var $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0;
 var $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0;
 var $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0;
 var $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0;
 var $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0;
 var $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0;
 var $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0;
 var $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0;
 var $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0;
 var $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0;
 var $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0;
 var $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0;
 var $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0;
 var $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0;
 var $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0;
 var $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0;
 var $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0;
 var $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0;
 var $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0;
 var $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0;
 var $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0;
 var $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0;
 var $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0;
 var $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0;
 var $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0;
 var $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0;
 var $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0;
 var $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0;
 var $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0;
 var $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0;
 var $743 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0;
 var $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $33 = sp + 152|0;
 $34 = sp + 128|0;
 $35 = sp + 104|0;
 $36 = sp + 80|0;
 $44 = sp + 8|0;
 $45 = sp;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $14 = 0;
 dest=$35; stop=dest+24|0; do { HEAP16[dest>>1]=0|0; dest=dest+2|0; } while ((dest|0) < (stop|0));
 dest=$36; stop=dest+24|0; do { HEAP16[dest>>1]=0|0; dest=dest+2|0; } while ((dest|0) < (stop|0));
 $41 = 0;
 $50 = $7;
 $51 = ($50|0)==(80);
 do {
  if ($51) {
   $52 = $4;
   $53 = ((($52)) + 708|0);
   $54 = HEAP16[$53>>1]|0;
   $46 = $54;
   $55 = $4;
   $56 = ((($55)) + 714|0);
   $57 = HEAP16[$56>>1]|0;
   $47 = $57;
   $58 = $4;
   $59 = ((($58)) + 720|0);
   $60 = HEAP16[$59>>1]|0;
   $48 = $60;
   $61 = $4;
   $62 = ((($61)) + 726|0);
   $63 = HEAP16[$62>>1]|0;
   $49 = $63;
  } else {
   $64 = $7;
   $65 = ($64|0)==(160);
   $66 = $4;
   $67 = ((($66)) + 708|0);
   if ($65) {
    $68 = ((($67)) + 2|0);
    $69 = HEAP16[$68>>1]|0;
    $46 = $69;
    $70 = $4;
    $71 = ((($70)) + 714|0);
    $72 = ((($71)) + 2|0);
    $73 = HEAP16[$72>>1]|0;
    $47 = $73;
    $74 = $4;
    $75 = ((($74)) + 720|0);
    $76 = ((($75)) + 2|0);
    $77 = HEAP16[$76>>1]|0;
    $48 = $77;
    $78 = $4;
    $79 = ((($78)) + 726|0);
    $80 = ((($79)) + 2|0);
    $81 = HEAP16[$80>>1]|0;
    $49 = $81;
    break;
   } else {
    $82 = ((($67)) + 4|0);
    $83 = HEAP16[$82>>1]|0;
    $46 = $83;
    $84 = $4;
    $85 = ((($84)) + 714|0);
    $86 = ((($85)) + 4|0);
    $87 = HEAP16[$86>>1]|0;
    $47 = $87;
    $88 = $4;
    $89 = ((($88)) + 720|0);
    $90 = ((($89)) + 4|0);
    $91 = HEAP16[$90>>1]|0;
    $48 = $91;
    $92 = $4;
    $93 = ((($92)) + 726|0);
    $94 = ((($93)) + 4|0);
    $95 = HEAP16[$94>>1]|0;
    $49 = $95;
    break;
   }
  }
 } while(0);
 $96 = $6;
 $97 = $96 << 16 >> 16;
 $98 = ($97|0)>(10);
 if ($98) {
  $8 = 0;
  while(1) {
   $99 = $8;
   $100 = ($99|0)<(6);
   if (!($100)) {
    break;
   }
   $37 = 0;
   $38 = 0;
   $9 = 0;
   while(1) {
    $101 = $9;
    $102 = ($101|0)<(2);
    if (!($102)) {
     break;
    }
    $103 = $8;
    $104 = $9;
    $105 = ($104*6)|0;
    $106 = (($103) + ($105))|0;
    $21 = $106;
    $107 = $5;
    $108 = $8;
    $109 = (($107) + ($108<<1)|0);
    $110 = HEAP16[$109>>1]|0;
    $111 = $4;
    $112 = ((($111)) + 180|0);
    $113 = $21;
    $114 = (($112) + ($113<<1)|0);
    $115 = HEAP16[$114>>1]|0;
    $116 = $4;
    $117 = ((($116)) + 228|0);
    $118 = $21;
    $119 = (($117) + ($118<<1)|0);
    $120 = HEAP16[$119>>1]|0;
    $121 = $21;
    $122 = (($33) + ($121<<1)|0);
    $123 = (_WebRtcVad_GaussianProbability($110,$115,$120,$122)|0);
    $39 = $123;
    $124 = $21;
    $125 = (592 + ($124<<1)|0);
    $126 = HEAP16[$125>>1]|0;
    $127 = $126 << 16 >> 16;
    $128 = $39;
    $129 = Math_imul($127, $128)|0;
    $130 = $9;
    $131 = (($44) + ($130<<2)|0);
    HEAP32[$131>>2] = $129;
    $132 = $9;
    $133 = (($44) + ($132<<2)|0);
    $134 = HEAP32[$133>>2]|0;
    $135 = $37;
    $136 = (($135) + ($134))|0;
    $37 = $136;
    $137 = $5;
    $138 = $8;
    $139 = (($137) + ($138<<1)|0);
    $140 = HEAP16[$139>>1]|0;
    $141 = $4;
    $142 = ((($141)) + 204|0);
    $143 = $21;
    $144 = (($142) + ($143<<1)|0);
    $145 = HEAP16[$144>>1]|0;
    $146 = $4;
    $147 = ((($146)) + 252|0);
    $148 = $21;
    $149 = (($147) + ($148<<1)|0);
    $150 = HEAP16[$149>>1]|0;
    $151 = $21;
    $152 = (($34) + ($151<<1)|0);
    $153 = (_WebRtcVad_GaussianProbability($140,$145,$150,$152)|0);
    $39 = $153;
    $154 = $21;
    $155 = (616 + ($154<<1)|0);
    $156 = HEAP16[$155>>1]|0;
    $157 = $156 << 16 >> 16;
    $158 = $39;
    $159 = Math_imul($157, $158)|0;
    $160 = $9;
    $161 = (($45) + ($160<<2)|0);
    HEAP32[$161>>2] = $159;
    $162 = $9;
    $163 = (($45) + ($162<<2)|0);
    $164 = HEAP32[$163>>2]|0;
    $165 = $38;
    $166 = (($165) + ($164))|0;
    $38 = $166;
    $167 = $9;
    $168 = (($167) + 1)|0;
    $9 = $168;
   }
   $169 = $37;
   $170 = (_WebRtcSpl_NormW32($169)|0);
   $171 = $170&65535;
   $15 = $171;
   $172 = $38;
   $173 = (_WebRtcSpl_NormW32($172)|0);
   $174 = $173&65535;
   $16 = $174;
   $175 = $37;
   $176 = ($175|0)==(0);
   if ($176) {
    $15 = 31;
   }
   $177 = $38;
   $178 = ($177|0)==(0);
   if ($178) {
    $16 = 31;
   }
   $179 = $15;
   $180 = $179 << 16 >> 16;
   $181 = $16;
   $182 = $181 << 16 >> 16;
   $183 = (($180) - ($182))|0;
   $184 = $183&65535;
   $13 = $184;
   $185 = $13;
   $186 = $185 << 16 >> 16;
   $187 = $8;
   $188 = (640 + ($187<<1)|0);
   $189 = HEAP16[$188>>1]|0;
   $190 = $189 << 16 >> 16;
   $191 = Math_imul($186, $190)|0;
   $192 = $41;
   $193 = (($192) + ($191))|0;
   $41 = $193;
   $194 = $13;
   $195 = $194 << 16 >> 16;
   $196 = $195 << 2;
   $197 = $48;
   $198 = $197 << 16 >> 16;
   $199 = ($196|0)>($198|0);
   if ($199) {
    $14 = 1;
   }
   $200 = $37;
   $201 = $200 >> 12;
   $202 = $201&65535;
   $11 = $202;
   $203 = $11;
   $204 = $203 << 16 >> 16;
   $205 = ($204|0)>(0);
   if ($205) {
    $206 = HEAP32[$44>>2]|0;
    $207 = $206 & -4096;
    $208 = $207 << 2;
    $39 = $208;
    $209 = $39;
    $210 = $11;
    $211 = (_WebRtcSpl_DivW32W16($209,$210)|0);
    $212 = $211&65535;
    $213 = $8;
    $214 = (($35) + ($213<<1)|0);
    HEAP16[$214>>1] = $212;
    $215 = $8;
    $216 = (($35) + ($215<<1)|0);
    $217 = HEAP16[$216>>1]|0;
    $218 = $217 << 16 >> 16;
    $219 = (16384 - ($218))|0;
    $220 = $219&65535;
    $221 = $8;
    $222 = (($221) + 6)|0;
    $$sink = $220;$$sink2 = $222;
   } else {
    $223 = $8;
    $$sink = 16384;$$sink2 = $223;
   }
   $224 = (($35) + ($$sink2<<1)|0);
   HEAP16[$224>>1] = $$sink;
   $225 = $38;
   $226 = $225 >> 12;
   $227 = $226&65535;
   $12 = $227;
   $228 = $12;
   $229 = $228 << 16 >> 16;
   $230 = ($229|0)>(0);
   if ($230) {
    $231 = HEAP32[$45>>2]|0;
    $232 = $231 & -4096;
    $233 = $232 << 2;
    $39 = $233;
    $234 = $39;
    $235 = $12;
    $236 = (_WebRtcSpl_DivW32W16($234,$235)|0);
    $237 = $236&65535;
    $238 = $8;
    $239 = (($36) + ($238<<1)|0);
    HEAP16[$239>>1] = $237;
    $240 = $8;
    $241 = (($36) + ($240<<1)|0);
    $242 = HEAP16[$241>>1]|0;
    $243 = $242 << 16 >> 16;
    $244 = (16384 - ($243))|0;
    $245 = $244&65535;
    $246 = $8;
    $247 = (($246) + 6)|0;
    $248 = (($36) + ($247<<1)|0);
    HEAP16[$248>>1] = $245;
   }
   $249 = $8;
   $250 = (($249) + 1)|0;
   $8 = $250;
  }
  $251 = $41;
  $252 = $49;
  $253 = $252 << 16 >> 16;
  $254 = ($251|0)>=($253|0);
  $255 = $254&1;
  $256 = $14;
  $257 = $256 << 16 >> 16;
  $258 = $257 | $255;
  $259 = $258&65535;
  $14 = $259;
  $31 = 12800;
  $8 = 0;
  while(1) {
   $260 = $8;
   $261 = ($260|0)<(6);
   $262 = $4;
   if (!($261)) {
    break;
   }
   $263 = $5;
   $264 = $8;
   $265 = (($263) + ($264<<1)|0);
   $266 = HEAP16[$265>>1]|0;
   $267 = $8;
   $268 = (_WebRtcVad_FindMinimum($262,$266,$267)|0);
   $10 = $268;
   $269 = $4;
   $270 = ((($269)) + 180|0);
   $271 = $8;
   $272 = (($270) + ($271<<1)|0);
   $273 = $8;
   $274 = (592 + ($273<<1)|0);
   $275 = (_WeightedAverage($272,0,$274)|0);
   $42 = $275;
   $276 = $42;
   $277 = $276 >> 6;
   $278 = $277&65535;
   $18 = $278;
   $9 = 0;
   while(1) {
    $279 = $9;
    $280 = ($279|0)<(2);
    if (!($280)) {
     break;
    }
    $281 = $8;
    $282 = $9;
    $283 = ($282*6)|0;
    $284 = (($281) + ($283))|0;
    $21 = $284;
    $285 = $4;
    $286 = ((($285)) + 180|0);
    $287 = $21;
    $288 = (($286) + ($287<<1)|0);
    $289 = HEAP16[$288>>1]|0;
    $22 = $289;
    $290 = $4;
    $291 = ((($290)) + 204|0);
    $292 = $21;
    $293 = (($291) + ($292<<1)|0);
    $294 = HEAP16[$293>>1]|0;
    $25 = $294;
    $295 = $4;
    $296 = ((($295)) + 228|0);
    $297 = $21;
    $298 = (($296) + ($297<<1)|0);
    $299 = HEAP16[$298>>1]|0;
    $27 = $299;
    $300 = $4;
    $301 = ((($300)) + 252|0);
    $302 = $21;
    $303 = (($301) + ($302<<1)|0);
    $304 = HEAP16[$303>>1]|0;
    $28 = $304;
    $305 = $22;
    $23 = $305;
    $306 = $14;
    $307 = ($306<<16>>16)!=(0);
    if (!($307)) {
     $308 = $21;
     $309 = (($35) + ($308<<1)|0);
     $310 = HEAP16[$309>>1]|0;
     $311 = $310 << 16 >> 16;
     $312 = $21;
     $313 = (($33) + ($312<<1)|0);
     $314 = HEAP16[$313>>1]|0;
     $315 = $314 << 16 >> 16;
     $316 = Math_imul($311, $315)|0;
     $317 = $316 >> 11;
     $318 = $317&65535;
     $29 = $318;
     $319 = $22;
     $320 = $319 << 16 >> 16;
     $321 = $29;
     $322 = $321 << 16 >> 16;
     $323 = ($322*655)|0;
     $324 = $323 >> 22;
     $325 = $324&65535;
     $326 = $325 << 16 >> 16;
     $327 = (($320) + ($326))|0;
     $328 = $327&65535;
     $23 = $328;
    }
    $329 = $10;
    $330 = $329 << 16 >> 16;
    $331 = $330 << 4;
    $332 = $18;
    $333 = $332 << 16 >> 16;
    $334 = (($331) - ($333))|0;
    $335 = $334&65535;
    $30 = $335;
    $336 = $23;
    $337 = $336 << 16 >> 16;
    $338 = $30;
    $339 = $338 << 16 >> 16;
    $340 = ($339*154)|0;
    $341 = $340 >> 9;
    $342 = $341&65535;
    $343 = $342 << 16 >> 16;
    $344 = (($337) + ($343))|0;
    $345 = $344&65535;
    $24 = $345;
    $346 = $9;
    $347 = (($346) + 5)|0;
    $348 = $347 << 7;
    $349 = $348&65535;
    $17 = $349;
    $350 = $24;
    $351 = $350 << 16 >> 16;
    $352 = $17;
    $353 = $352 << 16 >> 16;
    $354 = ($351|0)<($353|0);
    if ($354) {
     $355 = $17;
     $24 = $355;
    }
    $356 = $9;
    $357 = (72 + ($356))|0;
    $358 = $8;
    $359 = (($357) - ($358))|0;
    $360 = $359 << 7;
    $361 = $360&65535;
    $17 = $361;
    $362 = $24;
    $363 = $362 << 16 >> 16;
    $364 = $17;
    $365 = $364 << 16 >> 16;
    $366 = ($363|0)>($365|0);
    if ($366) {
     $367 = $17;
     $24 = $367;
    }
    $368 = $24;
    $369 = $4;
    $370 = ((($369)) + 180|0);
    $371 = $21;
    $372 = (($370) + ($371<<1)|0);
    HEAP16[$372>>1] = $368;
    $373 = $14;
    $374 = ($373<<16>>16)!=(0);
    if ($374) {
     $375 = $21;
     $376 = (($36) + ($375<<1)|0);
     $377 = HEAP16[$376>>1]|0;
     $378 = $377 << 16 >> 16;
     $379 = $21;
     $380 = (($34) + ($379<<1)|0);
     $381 = HEAP16[$380>>1]|0;
     $382 = $381 << 16 >> 16;
     $383 = Math_imul($378, $382)|0;
     $384 = $383 >> 11;
     $385 = $384&65535;
     $29 = $385;
     $386 = $29;
     $387 = $386 << 16 >> 16;
     $388 = ($387*6554)|0;
     $389 = $388 >> 21;
     $390 = $389&65535;
     $17 = $390;
     $391 = $25;
     $392 = $391 << 16 >> 16;
     $393 = $17;
     $394 = $393 << 16 >> 16;
     $395 = (($394) + 1)|0;
     $396 = $395 >> 1;
     $397 = (($392) + ($396))|0;
     $398 = $397&65535;
     $26 = $398;
     $399 = $31;
     $400 = $399 << 16 >> 16;
     $401 = (($400) + 640)|0;
     $402 = $401&65535;
     $32 = $402;
     $403 = $26;
     $404 = $403 << 16 >> 16;
     $405 = $9;
     $406 = (652 + ($405<<1)|0);
     $407 = HEAP16[$406>>1]|0;
     $408 = $407 << 16 >> 16;
     $409 = ($404|0)<($408|0);
     if ($409) {
      $410 = $9;
      $411 = (652 + ($410<<1)|0);
      $412 = HEAP16[$411>>1]|0;
      $26 = $412;
     }
     $413 = $26;
     $414 = $413 << 16 >> 16;
     $415 = $32;
     $416 = $415 << 16 >> 16;
     $417 = ($414|0)>($416|0);
     if ($417) {
      $418 = $32;
      $26 = $418;
     }
     $419 = $26;
     $420 = $4;
     $421 = ((($420)) + 204|0);
     $422 = $21;
     $423 = (($421) + ($422<<1)|0);
     HEAP16[$423>>1] = $419;
     $424 = $25;
     $425 = $424 << 16 >> 16;
     $426 = (($425) + 4)|0;
     $427 = $426 >> 3;
     $428 = $427&65535;
     $17 = $428;
     $429 = $5;
     $430 = $8;
     $431 = (($429) + ($430<<1)|0);
     $432 = HEAP16[$431>>1]|0;
     $433 = $432 << 16 >> 16;
     $434 = $17;
     $435 = $434 << 16 >> 16;
     $436 = (($433) - ($435))|0;
     $437 = $436&65535;
     $17 = $437;
     $438 = $21;
     $439 = (($34) + ($438<<1)|0);
     $440 = HEAP16[$439>>1]|0;
     $441 = $440 << 16 >> 16;
     $442 = $17;
     $443 = $442 << 16 >> 16;
     $444 = Math_imul($441, $443)|0;
     $445 = $444 >> 3;
     $39 = $445;
     $446 = $39;
     $447 = (($446) - 4096)|0;
     $40 = $447;
     $448 = $21;
     $449 = (($36) + ($448<<1)|0);
     $450 = HEAP16[$449>>1]|0;
     $451 = $450 << 16 >> 16;
     $452 = $451 >> 2;
     $453 = $452&65535;
     $17 = $453;
     $454 = $17;
     $455 = $454 << 16 >> 16;
     $456 = $40;
     $457 = Math_imul($455, $456)|0;
     $39 = $457;
     $458 = $39;
     $459 = $458 >> 4;
     $40 = $459;
     $460 = $40;
     $461 = ($460|0)>(0);
     $462 = $40;
     if ($461) {
      $463 = $28;
      $464 = $463 << 16 >> 16;
      $465 = ($464*10)|0;
      $466 = $465&65535;
      $467 = (_WebRtcSpl_DivW32W16($462,$466)|0);
      $468 = $467&65535;
      $17 = $468;
     } else {
      $469 = (0 - ($462))|0;
      $470 = $28;
      $471 = $470 << 16 >> 16;
      $472 = ($471*10)|0;
      $473 = $472&65535;
      $474 = (_WebRtcSpl_DivW32W16($469,$473)|0);
      $475 = $474&65535;
      $17 = $475;
      $476 = $17;
      $477 = $476 << 16 >> 16;
      $478 = (0 - ($477))|0;
      $479 = $478&65535;
      $17 = $479;
     }
     $480 = $17;
     $481 = $480 << 16 >> 16;
     $482 = (($481) + 128)|0;
     $483 = $482&65535;
     $17 = $483;
     $484 = $17;
     $485 = $484 << 16 >> 16;
     $486 = $485 >> 8;
     $487 = $28;
     $488 = $487 << 16 >> 16;
     $489 = (($488) + ($486))|0;
     $490 = $489&65535;
     $28 = $490;
     $491 = $28;
     $492 = $491 << 16 >> 16;
     $493 = ($492|0)<(384);
     $$ = $493 ? 384 : $490;
     $28 = $$;
     $494 = $28;
     $495 = $4;
     $496 = ((($495)) + 252|0);
     $497 = $21;
     $498 = (($496) + ($497<<1)|0);
     $$sink7 = $494;$$sink8 = $498;
    } else {
     $499 = $5;
     $500 = $8;
     $501 = (($499) + ($500<<1)|0);
     $502 = HEAP16[$501>>1]|0;
     $503 = $502 << 16 >> 16;
     $504 = $22;
     $505 = $504 << 16 >> 16;
     $506 = $505 >> 3;
     $507 = (($503) - ($506))|0;
     $508 = $507&65535;
     $17 = $508;
     $509 = $21;
     $510 = (($33) + ($509<<1)|0);
     $511 = HEAP16[$510>>1]|0;
     $512 = $511 << 16 >> 16;
     $513 = $17;
     $514 = $513 << 16 >> 16;
     $515 = Math_imul($512, $514)|0;
     $516 = $515 >> 3;
     $39 = $516;
     $517 = $39;
     $518 = (($517) - 4096)|0;
     $39 = $518;
     $519 = $21;
     $520 = (($35) + ($519<<1)|0);
     $521 = HEAP16[$520>>1]|0;
     $522 = $521 << 16 >> 16;
     $523 = (($522) + 2)|0;
     $524 = $523 >> 2;
     $525 = $524&65535;
     $17 = $525;
     $526 = $17;
     $527 = $526 << 16 >> 16;
     $528 = $39;
     $529 = Math_imul($527, $528)|0;
     $40 = $529;
     $530 = $40;
     $531 = $530 >> 14;
     $39 = $531;
     $532 = $39;
     $533 = ($532|0)>(0);
     $534 = $39;
     if ($533) {
      $535 = $27;
      $536 = (_WebRtcSpl_DivW32W16($534,$535)|0);
      $537 = $536&65535;
      $17 = $537;
     } else {
      $538 = (0 - ($534))|0;
      $539 = $27;
      $540 = (_WebRtcSpl_DivW32W16($538,$539)|0);
      $541 = $540&65535;
      $17 = $541;
      $542 = $17;
      $543 = $542 << 16 >> 16;
      $544 = (0 - ($543))|0;
      $545 = $544&65535;
      $17 = $545;
     }
     $546 = $17;
     $547 = $546 << 16 >> 16;
     $548 = (($547) + 32)|0;
     $549 = $548&65535;
     $17 = $549;
     $550 = $17;
     $551 = $550 << 16 >> 16;
     $552 = $551 >> 6;
     $553 = $27;
     $554 = $553 << 16 >> 16;
     $555 = (($554) + ($552))|0;
     $556 = $555&65535;
     $27 = $556;
     $557 = $27;
     $558 = $557 << 16 >> 16;
     $559 = ($558|0)<(384);
     $$3 = $559 ? 384 : $556;
     $27 = $$3;
     $560 = $27;
     $561 = $4;
     $562 = ((($561)) + 228|0);
     $563 = $21;
     $564 = (($562) + ($563<<1)|0);
     $$sink7 = $560;$$sink8 = $564;
    }
    HEAP16[$$sink8>>1] = $$sink7;
    $565 = $9;
    $566 = (($565) + 1)|0;
    $9 = $566;
   }
   $567 = $4;
   $568 = ((($567)) + 180|0);
   $569 = $8;
   $570 = (($568) + ($569<<1)|0);
   $571 = $8;
   $572 = (592 + ($571<<1)|0);
   $573 = (_WeightedAverage($570,0,$572)|0);
   $42 = $573;
   $574 = $4;
   $575 = ((($574)) + 204|0);
   $576 = $8;
   $577 = (($575) + ($576<<1)|0);
   $578 = $8;
   $579 = (616 + ($578<<1)|0);
   $580 = (_WeightedAverage($577,0,$579)|0);
   $43 = $580;
   $581 = $43;
   $582 = $581 >> 9;
   $583 = $582&65535;
   $584 = $583 << 16 >> 16;
   $585 = $42;
   $586 = $585 >> 9;
   $587 = $586&65535;
   $588 = $587 << 16 >> 16;
   $589 = (($584) - ($588))|0;
   $590 = $589&65535;
   $20 = $590;
   $591 = $20;
   $592 = $591 << 16 >> 16;
   $593 = $8;
   $594 = (656 + ($593<<1)|0);
   $595 = HEAP16[$594>>1]|0;
   $596 = $595 << 16 >> 16;
   $597 = ($592|0)<($596|0);
   if ($597) {
    $598 = $8;
    $599 = (656 + ($598<<1)|0);
    $600 = HEAP16[$599>>1]|0;
    $601 = $600 << 16 >> 16;
    $602 = $20;
    $603 = $602 << 16 >> 16;
    $604 = (($601) - ($603))|0;
    $605 = $604&65535;
    $17 = $605;
    $606 = $17;
    $607 = $606 << 16 >> 16;
    $608 = ($607*13)|0;
    $609 = $608 >> 2;
    $610 = $609&65535;
    $18 = $610;
    $611 = $17;
    $612 = $611 << 16 >> 16;
    $613 = ($612*3)|0;
    $614 = $613 >> 2;
    $615 = $614&65535;
    $19 = $615;
    $616 = $4;
    $617 = ((($616)) + 204|0);
    $618 = $8;
    $619 = (($617) + ($618<<1)|0);
    $620 = $18;
    $621 = $8;
    $622 = (616 + ($621<<1)|0);
    $623 = (_WeightedAverage($619,$620,$622)|0);
    $43 = $623;
    $624 = $4;
    $625 = ((($624)) + 180|0);
    $626 = $8;
    $627 = (($625) + ($626<<1)|0);
    $628 = $19;
    $629 = $628 << 16 >> 16;
    $630 = (0 - ($629))|0;
    $631 = $630&65535;
    $632 = $8;
    $633 = (592 + ($632<<1)|0);
    $634 = (_WeightedAverage($627,$631,$633)|0);
    $42 = $634;
   }
   $635 = $8;
   $636 = (668 + ($635<<1)|0);
   $637 = HEAP16[$636>>1]|0;
   $31 = $637;
   $638 = $43;
   $639 = $638 >> 7;
   $640 = $639&65535;
   $19 = $640;
   $641 = $19;
   $642 = $641 << 16 >> 16;
   $643 = $31;
   $644 = $643 << 16 >> 16;
   $645 = ($642|0)>($644|0);
   L71: do {
    if ($645) {
     $646 = $31;
     $647 = $646 << 16 >> 16;
     $648 = $19;
     $649 = $648 << 16 >> 16;
     $650 = (($649) - ($647))|0;
     $651 = $650&65535;
     $19 = $651;
     $9 = 0;
     while(1) {
      $652 = $9;
      $653 = ($652|0)<(2);
      if (!($653)) {
       break L71;
      }
      $654 = $19;
      $655 = $654 << 16 >> 16;
      $656 = $4;
      $657 = ((($656)) + 204|0);
      $658 = $8;
      $659 = $9;
      $660 = ($659*6)|0;
      $661 = (($658) + ($660))|0;
      $662 = (($657) + ($661<<1)|0);
      $663 = HEAP16[$662>>1]|0;
      $664 = $663 << 16 >> 16;
      $665 = (($664) - ($655))|0;
      $666 = $665&65535;
      HEAP16[$662>>1] = $666;
      $667 = $9;
      $668 = (($667) + 1)|0;
      $9 = $668;
     }
    }
   } while(0);
   $669 = $42;
   $670 = $669 >> 7;
   $671 = $670&65535;
   $19 = $671;
   $672 = $19;
   $673 = $672 << 16 >> 16;
   $674 = $8;
   $675 = (680 + ($674<<1)|0);
   $676 = HEAP16[$675>>1]|0;
   $677 = $676 << 16 >> 16;
   $678 = ($673|0)>($677|0);
   L77: do {
    if ($678) {
     $679 = $8;
     $680 = (680 + ($679<<1)|0);
     $681 = HEAP16[$680>>1]|0;
     $682 = $681 << 16 >> 16;
     $683 = $19;
     $684 = $683 << 16 >> 16;
     $685 = (($684) - ($682))|0;
     $686 = $685&65535;
     $19 = $686;
     $9 = 0;
     while(1) {
      $687 = $9;
      $688 = ($687|0)<(2);
      if (!($688)) {
       break L77;
      }
      $689 = $19;
      $690 = $689 << 16 >> 16;
      $691 = $4;
      $692 = ((($691)) + 180|0);
      $693 = $8;
      $694 = $9;
      $695 = ($694*6)|0;
      $696 = (($693) + ($695))|0;
      $697 = (($692) + ($696<<1)|0);
      $698 = HEAP16[$697>>1]|0;
      $699 = $698 << 16 >> 16;
      $700 = (($699) - ($690))|0;
      $701 = $700&65535;
      HEAP16[$697>>1] = $701;
      $702 = $9;
      $703 = (($702) + 1)|0;
      $9 = $703;
     }
    }
   } while(0);
   $704 = $8;
   $705 = (($704) + 1)|0;
   $8 = $705;
  }
  $706 = ((($262)) + 276|0);
  $707 = HEAP32[$706>>2]|0;
  $708 = (($707) + 1)|0;
  HEAP32[$706>>2] = $708;
 }
 $709 = $14;
 $710 = ($709<<16>>16)!=(0);
 $711 = $4;
 if (!($710)) {
  $712 = ((($711)) + 280|0);
  $713 = HEAP16[$712>>1]|0;
  $714 = $713 << 16 >> 16;
  $715 = ($714|0)>(0);
  if ($715) {
   $716 = $4;
   $717 = ((($716)) + 280|0);
   $718 = HEAP16[$717>>1]|0;
   $719 = $718 << 16 >> 16;
   $720 = (2 + ($719))|0;
   $721 = $720&65535;
   $14 = $721;
   $722 = $4;
   $723 = ((($722)) + 280|0);
   $724 = HEAP16[$723>>1]|0;
   $725 = (($724) + -1)<<16>>16;
   HEAP16[$723>>1] = $725;
  }
  $726 = $4;
  $727 = ((($726)) + 282|0);
  HEAP16[$727>>1] = 0;
  $743 = $14;
  STACKTOP = sp;return ($743|0);
 }
 $728 = ((($711)) + 282|0);
 $729 = HEAP16[$728>>1]|0;
 $730 = (($729) + 1)<<16>>16;
 HEAP16[$728>>1] = $730;
 $731 = $4;
 $732 = ((($731)) + 282|0);
 $733 = HEAP16[$732>>1]|0;
 $734 = $733 << 16 >> 16;
 $735 = ($734|0)>(6);
 if ($735) {
  $736 = $4;
  $737 = ((($736)) + 282|0);
  HEAP16[$737>>1] = 6;
  $738 = $47;
  $739 = $4;
  $$sink4 = $738;$$sink6 = $739;
 } else {
  $740 = $46;
  $741 = $4;
  $$sink4 = $740;$$sink6 = $741;
 }
 $742 = ((($$sink6)) + 280|0);
 HEAP16[$742>>1] = $$sink4;
 $743 = $14;
 STACKTOP = sp;return ($743|0);
}
function _WebRtcSpl_NormW32($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $2;
 $5 = ($4|0)==(0);
 if ($5) {
  $1 = 0;
  $42 = $1;
  STACKTOP = sp;return ($42|0);
 }
 $6 = $2;
 $7 = ($6|0)<(0);
 if ($7) {
  $8 = $2;
  $9 = $8 ^ -1;
  $2 = $9;
 }
 $10 = $2;
 $11 = -32768 & $10;
 $12 = ($11|0)!=(0);
 if ($12) {
  $3 = 0;
 } else {
  $3 = 16;
 }
 $13 = $2;
 $14 = $3;
 $15 = $13 << $14;
 $16 = -8388608 & $15;
 $17 = ($16|0)!=(0);
 if (!($17)) {
  $18 = $3;
  $19 = (($18) + 8)|0;
  $3 = $19;
 }
 $20 = $2;
 $21 = $3;
 $22 = $20 << $21;
 $23 = -134217728 & $22;
 $24 = ($23|0)!=(0);
 if (!($24)) {
  $25 = $3;
  $26 = (($25) + 4)|0;
  $3 = $26;
 }
 $27 = $2;
 $28 = $3;
 $29 = $27 << $28;
 $30 = -536870912 & $29;
 $31 = ($30|0)!=(0);
 if (!($31)) {
  $32 = $3;
  $33 = (($32) + 2)|0;
  $3 = $33;
 }
 $34 = $2;
 $35 = $3;
 $36 = $34 << $35;
 $37 = -1073741824 & $36;
 $38 = ($37|0)!=(0);
 if (!($38)) {
  $39 = $3;
  $40 = (($39) + 1)|0;
  $3 = $40;
 }
 $41 = $3;
 $1 = $41;
 $42 = $1;
 STACKTOP = sp;return ($42|0);
}
function _WeightedAverage($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = 0;
 $6 = 0;
 while(1) {
  $8 = $6;
  $9 = ($8|0)<(2);
  if (!($9)) {
   break;
  }
  $10 = $4;
  $11 = $10 << 16 >> 16;
  $12 = $3;
  $13 = $6;
  $14 = ($13*6)|0;
  $15 = (($12) + ($14<<1)|0);
  $16 = HEAP16[$15>>1]|0;
  $17 = $16 << 16 >> 16;
  $18 = (($17) + ($11))|0;
  $19 = $18&65535;
  HEAP16[$15>>1] = $19;
  $20 = $3;
  $21 = $6;
  $22 = ($21*6)|0;
  $23 = (($20) + ($22<<1)|0);
  $24 = HEAP16[$23>>1]|0;
  $25 = $24 << 16 >> 16;
  $26 = $5;
  $27 = $6;
  $28 = ($27*6)|0;
  $29 = (($26) + ($28<<1)|0);
  $30 = HEAP16[$29>>1]|0;
  $31 = $30 << 16 >> 16;
  $32 = Math_imul($25, $31)|0;
  $33 = $7;
  $34 = (($33) + ($32))|0;
  $7 = $34;
  $35 = $6;
  $36 = (($35) + 1)|0;
  $6 = $36;
 }
 $37 = $7;
 STACKTOP = sp;return ($37|0);
}
function _WebRtcVad_CalcVad32khz($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 1472|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(1472|0);
 $8 = sp + 504|0;
 $9 = sp + 24|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $10 = $4;
 $11 = $3;
 $12 = ((($11)) + 4|0);
 $13 = ((($12)) + 8|0);
 $14 = $5;
 _WebRtcVad_Downsampling($10,$8,$13,$14);
 $15 = $5;
 $16 = $15 >> 1;
 $6 = $16;
 $17 = $3;
 $18 = ((($17)) + 4|0);
 $19 = $6;
 _WebRtcVad_Downsampling($8,$9,$18,$19);
 $20 = $6;
 $21 = $20 >> 1;
 $6 = $21;
 $22 = $3;
 $23 = $6;
 $24 = (_WebRtcVad_CalcVad8khz($22,$9,$23)|0);
 $7 = $24;
 $25 = $7;
 STACKTOP = sp;return ($25|0);
}
function _WebRtcVad_CalcVad16khz($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 512|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(512|0);
 $8 = sp + 24|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $9 = $4;
 $10 = $3;
 $11 = ((($10)) + 4|0);
 $12 = $5;
 _WebRtcVad_Downsampling($9,$8,$11,$12);
 $13 = $5;
 $14 = $13 >> 1;
 $6 = $14;
 $15 = $3;
 $16 = $6;
 $17 = (_WebRtcVad_CalcVad8khz($15,$8,$16)|0);
 $7 = $17;
 $18 = $7;
 STACKTOP = sp;return ($18|0);
}
function _WebRtcVad_CalculateFeatures($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 768|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(768|0);
 $8 = sp + 760|0;
 $9 = sp + 520|0;
 $10 = sp + 280|0;
 $11 = sp + 160|0;
 $12 = sp + 40|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 HEAP16[$8>>1] = 0;
 $19 = $6;
 $20 = $19 >> 1;
 $13 = $20;
 $21 = $13;
 $14 = $21;
 $15 = 0;
 $22 = $5;
 $16 = $22;
 $17 = $9;
 $18 = $10;
 $23 = $6;
 $24 = ($23|0)>=(0);
 if (!($24)) {
  ___assert_fail((3627|0),(3644|0),266,(3685|0));
  // unreachable;
 }
 $25 = $6;
 $26 = ($25|0)<=(240);
 if ($26) {
  $27 = $16;
  $28 = $6;
  $29 = $4;
  $30 = ((($29)) + 680|0);
  $31 = $15;
  $32 = (($30) + ($31<<1)|0);
  $33 = $4;
  $34 = ((($33)) + 690|0);
  $35 = $15;
  $36 = (($34) + ($35<<1)|0);
  $37 = $17;
  $38 = $18;
  _SplitFilter($27,$28,$32,$36,$37,$38);
  $15 = 1;
  $16 = $9;
  $17 = $11;
  $18 = $12;
  $39 = $16;
  $40 = $14;
  $41 = $4;
  $42 = ((($41)) + 680|0);
  $43 = $15;
  $44 = (($42) + ($43<<1)|0);
  $45 = $4;
  $46 = ((($45)) + 690|0);
  $47 = $15;
  $48 = (($46) + ($47<<1)|0);
  $49 = $17;
  $50 = $18;
  _SplitFilter($39,$40,$44,$48,$49,$50);
  $51 = $14;
  $52 = $51 >> 1;
  $14 = $52;
  $53 = $14;
  $54 = HEAP16[(702)>>1]|0;
  $55 = $7;
  $56 = ((($55)) + 10|0);
  _LogOfEnergy($11,$53,$54,$8,$56);
  $57 = $14;
  $58 = HEAP16[(700)>>1]|0;
  $59 = $7;
  $60 = ((($59)) + 8|0);
  _LogOfEnergy($12,$57,$58,$8,$60);
  $15 = 2;
  $16 = $10;
  $17 = $11;
  $18 = $12;
  $61 = $13;
  $14 = $61;
  $62 = $16;
  $63 = $14;
  $64 = $4;
  $65 = ((($64)) + 680|0);
  $66 = $15;
  $67 = (($65) + ($66<<1)|0);
  $68 = $4;
  $69 = ((($68)) + 690|0);
  $70 = $15;
  $71 = (($69) + ($70<<1)|0);
  $72 = $17;
  $73 = $18;
  _SplitFilter($62,$63,$67,$71,$72,$73);
  $74 = $14;
  $75 = $74 >> 1;
  $14 = $75;
  $76 = $14;
  $77 = HEAP16[(698)>>1]|0;
  $78 = $7;
  $79 = ((($78)) + 6|0);
  _LogOfEnergy($11,$76,$77,$8,$79);
  $15 = 3;
  $16 = $12;
  $17 = $9;
  $18 = $10;
  $80 = $16;
  $81 = $14;
  $82 = $4;
  $83 = ((($82)) + 680|0);
  $84 = $15;
  $85 = (($83) + ($84<<1)|0);
  $86 = $4;
  $87 = ((($86)) + 690|0);
  $88 = $15;
  $89 = (($87) + ($88<<1)|0);
  $90 = $17;
  $91 = $18;
  _SplitFilter($80,$81,$85,$89,$90,$91);
  $92 = $14;
  $93 = $92 >> 1;
  $14 = $93;
  $94 = $14;
  $95 = HEAP16[(696)>>1]|0;
  $96 = $7;
  $97 = ((($96)) + 4|0);
  _LogOfEnergy($9,$94,$95,$8,$97);
  $15 = 4;
  $16 = $10;
  $17 = $11;
  $18 = $12;
  $98 = $16;
  $99 = $14;
  $100 = $4;
  $101 = ((($100)) + 680|0);
  $102 = $15;
  $103 = (($101) + ($102<<1)|0);
  $104 = $4;
  $105 = ((($104)) + 690|0);
  $106 = $15;
  $107 = (($105) + ($106<<1)|0);
  $108 = $17;
  $109 = $18;
  _SplitFilter($98,$99,$103,$107,$108,$109);
  $110 = $14;
  $111 = $110 >> 1;
  $14 = $111;
  $112 = $14;
  $113 = HEAP16[(694)>>1]|0;
  $114 = $7;
  $115 = ((($114)) + 2|0);
  _LogOfEnergy($11,$112,$113,$8,$115);
  $116 = $14;
  $117 = $4;
  $118 = ((($117)) + 700|0);
  _HighPassFilter($12,$116,$118,$9);
  $119 = $14;
  $120 = HEAP16[346]|0;
  $121 = $7;
  _LogOfEnergy($9,$119,$120,$8,$121);
  $122 = HEAP16[$8>>1]|0;
  STACKTOP = sp;return ($122|0);
 } else {
  ___assert_fail((3713|0),(3644|0),267,(3685|0));
  // unreachable;
 }
 return (0)|0;
}
function _SplitFilter($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $50 = 0, $51 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $6 = $0;
 $7 = $1;
 $8 = $2;
 $9 = $3;
 $10 = $4;
 $11 = $5;
 $15 = $7;
 $16 = $15 >> 1;
 $13 = $16;
 $17 = $6;
 $18 = $13;
 $19 = HEAP16[358]|0;
 $20 = $8;
 $21 = $10;
 _AllPassFilter($17,$18,$19,$20,$21);
 $22 = $6;
 $23 = ((($22)) + 2|0);
 $24 = $13;
 $25 = HEAP16[(718)>>1]|0;
 $26 = $9;
 $27 = $11;
 _AllPassFilter($23,$24,$25,$26,$27);
 $12 = 0;
 while(1) {
  $28 = $12;
  $29 = $13;
  $30 = ($28|0)<($29|0);
  if (!($30)) {
   break;
  }
  $31 = $10;
  $32 = HEAP16[$31>>1]|0;
  $14 = $32;
  $33 = $11;
  $34 = HEAP16[$33>>1]|0;
  $35 = $34 << 16 >> 16;
  $36 = $10;
  $37 = ((($36)) + 2|0);
  $10 = $37;
  $38 = HEAP16[$36>>1]|0;
  $39 = $38 << 16 >> 16;
  $40 = (($39) - ($35))|0;
  $41 = $40&65535;
  HEAP16[$36>>1] = $41;
  $42 = $14;
  $43 = $42 << 16 >> 16;
  $44 = $11;
  $45 = ((($44)) + 2|0);
  $11 = $45;
  $46 = HEAP16[$44>>1]|0;
  $47 = $46 << 16 >> 16;
  $48 = (($47) + ($43))|0;
  $49 = $48&65535;
  HEAP16[$44>>1] = $49;
  $50 = $12;
  $51 = (($50) + 1)|0;
  $12 = $51;
 }
 STACKTOP = sp;return;
}
function _LogOfEnergy($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$sink = 0, $$sink3 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $10 = sp + 8|0;
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 HEAP32[$10>>2] = 0;
 $11 = 0;
 $14 = $5;
 $15 = ($14|0)!=(0|0);
 if (!($15)) {
  ___assert_fail((3732|0),(3644|0),164,(3748|0));
  // unreachable;
 }
 $16 = $6;
 $17 = ($16|0)>(0);
 if (!($17)) {
  ___assert_fail((3760|0),(3644|0),165,(3748|0));
  // unreachable;
 }
 $18 = $5;
 $19 = $6;
 $20 = (_WebRtcSpl_Energy($18,$19,$10)|0);
 $11 = $20;
 $21 = $11;
 $22 = ($21|0)!=(0);
 if (!($22)) {
  $63 = $7;
  $64 = $9;
  HEAP16[$64>>1] = $63;
  STACKTOP = sp;return;
 }
 $23 = $11;
 $24 = (_WebRtcSpl_NormU32($23)|0);
 $25 = (17 - ($24))|0;
 $12 = $25;
 $13 = 14336;
 $26 = $12;
 $27 = HEAP32[$10>>2]|0;
 $28 = (($27) + ($26))|0;
 HEAP32[$10>>2] = $28;
 $29 = $12;
 $30 = ($29|0)<(0);
 $31 = $12;
 if ($30) {
  $32 = (0 - ($31))|0;
  $33 = $11;
  $34 = $33 << $32;
  $11 = $34;
 } else {
  $35 = $11;
  $36 = $35 >>> $31;
  $11 = $36;
 }
 $37 = $11;
 $38 = $37 & 16383;
 $39 = $38 >>> 4;
 $40 = $39&65535;
 $41 = $40 << 16 >> 16;
 $42 = $13;
 $43 = $42 << 16 >> 16;
 $44 = (($43) + ($41))|0;
 $45 = $44&65535;
 $13 = $45;
 $46 = $13;
 $47 = $46 << 16 >> 16;
 $48 = ($47*24660)|0;
 $49 = $48 >> 19;
 $50 = HEAP32[$10>>2]|0;
 $51 = $50&65535;
 $52 = $51 << 16 >> 16;
 $53 = ($52*24660)|0;
 $54 = $53 >> 9;
 $55 = (($49) + ($54))|0;
 $56 = $55&65535;
 $57 = $9;
 HEAP16[$57>>1] = $56;
 $58 = $9;
 $59 = HEAP16[$58>>1]|0;
 $60 = $59 << 16 >> 16;
 $61 = ($60|0)<(0);
 if ($61) {
  $62 = $9;
  HEAP16[$62>>1] = 0;
 }
 $65 = $7;
 $66 = $65 << 16 >> 16;
 $67 = $9;
 $68 = HEAP16[$67>>1]|0;
 $69 = $68 << 16 >> 16;
 $70 = (($69) + ($66))|0;
 $71 = $70&65535;
 HEAP16[$67>>1] = $71;
 $72 = $8;
 $73 = HEAP16[$72>>1]|0;
 $74 = $73 << 16 >> 16;
 $75 = ($74|0)<=(10);
 if (!($75)) {
  STACKTOP = sp;return;
 }
 $76 = HEAP32[$10>>2]|0;
 $77 = ($76|0)>=(0);
 if ($77) {
  $78 = $8;
  $$sink = $78;$$sink3 = 11;
 } else {
  $79 = $11;
  $80 = HEAP32[$10>>2]|0;
  $81 = (0 - ($80))|0;
  $82 = $79 >>> $81;
  $83 = $82&65535;
  $84 = $83 << 16 >> 16;
  $85 = $8;
  $$sink = $85;$$sink3 = $84;
 }
 $86 = HEAP16[$$sink>>1]|0;
 $87 = $86 << 16 >> 16;
 $88 = (($87) + ($$sink3))|0;
 $89 = $88&65535;
 HEAP16[$$sink>>1] = $89;
 STACKTOP = sp;return;
}
function _HighPassFilter($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $12 = $4;
 $9 = $12;
 $13 = $7;
 $10 = $13;
 $11 = 0;
 $8 = 0;
 while(1) {
  $14 = $8;
  $15 = $5;
  $16 = ($14|0)<($15|0);
  if (!($16)) {
   break;
  }
  $17 = HEAP16[352]|0;
  $18 = $17 << 16 >> 16;
  $19 = $9;
  $20 = HEAP16[$19>>1]|0;
  $21 = $20 << 16 >> 16;
  $22 = Math_imul($18, $21)|0;
  $11 = $22;
  $23 = HEAP16[(706)>>1]|0;
  $24 = $23 << 16 >> 16;
  $25 = $6;
  $26 = HEAP16[$25>>1]|0;
  $27 = $26 << 16 >> 16;
  $28 = Math_imul($24, $27)|0;
  $29 = $11;
  $30 = (($29) + ($28))|0;
  $11 = $30;
  $31 = HEAP16[(708)>>1]|0;
  $32 = $31 << 16 >> 16;
  $33 = $6;
  $34 = ((($33)) + 2|0);
  $35 = HEAP16[$34>>1]|0;
  $36 = $35 << 16 >> 16;
  $37 = Math_imul($32, $36)|0;
  $38 = $11;
  $39 = (($38) + ($37))|0;
  $11 = $39;
  $40 = $6;
  $41 = HEAP16[$40>>1]|0;
  $42 = $6;
  $43 = ((($42)) + 2|0);
  HEAP16[$43>>1] = $41;
  $44 = $9;
  $45 = ((($44)) + 2|0);
  $9 = $45;
  $46 = HEAP16[$44>>1]|0;
  $47 = $6;
  HEAP16[$47>>1] = $46;
  $48 = HEAP16[(712)>>1]|0;
  $49 = $48 << 16 >> 16;
  $50 = $6;
  $51 = ((($50)) + 4|0);
  $52 = HEAP16[$51>>1]|0;
  $53 = $52 << 16 >> 16;
  $54 = Math_imul($49, $53)|0;
  $55 = $11;
  $56 = (($55) - ($54))|0;
  $11 = $56;
  $57 = HEAP16[(714)>>1]|0;
  $58 = $57 << 16 >> 16;
  $59 = $6;
  $60 = ((($59)) + 6|0);
  $61 = HEAP16[$60>>1]|0;
  $62 = $61 << 16 >> 16;
  $63 = Math_imul($58, $62)|0;
  $64 = $11;
  $65 = (($64) - ($63))|0;
  $11 = $65;
  $66 = $6;
  $67 = ((($66)) + 4|0);
  $68 = HEAP16[$67>>1]|0;
  $69 = $6;
  $70 = ((($69)) + 6|0);
  HEAP16[$70>>1] = $68;
  $71 = $11;
  $72 = $71 >> 14;
  $73 = $72&65535;
  $74 = $6;
  $75 = ((($74)) + 4|0);
  HEAP16[$75>>1] = $73;
  $76 = $6;
  $77 = ((($76)) + 4|0);
  $78 = HEAP16[$77>>1]|0;
  $79 = $10;
  $80 = ((($79)) + 2|0);
  $10 = $80;
  HEAP16[$79>>1] = $78;
  $81 = $8;
  $82 = (($81) + 1)|0;
  $8 = $82;
 }
 STACKTOP = sp;return;
}
function _WebRtcSpl_NormU32($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $2;
 $5 = ($4|0)==(0);
 if ($5) {
  $1 = 0;
  $38 = $1;
  STACKTOP = sp;return ($38|0);
 }
 $6 = $2;
 $7 = -65536 & $6;
 $8 = ($7|0)!=(0);
 if ($8) {
  $3 = 0;
 } else {
  $3 = 16;
 }
 $9 = $2;
 $10 = $3;
 $11 = $9 << $10;
 $12 = -16777216 & $11;
 $13 = ($12|0)!=(0);
 if (!($13)) {
  $14 = $3;
  $15 = (($14) + 8)|0;
  $3 = $15;
 }
 $16 = $2;
 $17 = $3;
 $18 = $16 << $17;
 $19 = -268435456 & $18;
 $20 = ($19|0)!=(0);
 if (!($20)) {
  $21 = $3;
  $22 = (($21) + 4)|0;
  $3 = $22;
 }
 $23 = $2;
 $24 = $3;
 $25 = $23 << $24;
 $26 = -1073741824 & $25;
 $27 = ($26|0)!=(0);
 if (!($27)) {
  $28 = $3;
  $29 = (($28) + 2)|0;
  $3 = $29;
 }
 $30 = $2;
 $31 = $3;
 $32 = $30 << $31;
 $33 = -2147483648 & $32;
 $34 = ($33|0)!=(0);
 if (!($34)) {
  $35 = $3;
  $36 = (($35) + 1)|0;
  $3 = $36;
 }
 $37 = $3;
 $1 = $37;
 $38 = $1;
 STACKTOP = sp;return ($38|0);
}
function _AllPassFilter($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $11 = 0;
 $12 = 0;
 $14 = $8;
 $15 = HEAP16[$14>>1]|0;
 $16 = $15 << 16 >> 16;
 $17 = $16 << 16;
 $13 = $17;
 $10 = 0;
 while(1) {
  $18 = $10;
  $19 = $6;
  $20 = ($18|0)<($19|0);
  $21 = $13;
  if (!($20)) {
   break;
  }
  $22 = $7;
  $23 = $22 << 16 >> 16;
  $24 = $5;
  $25 = HEAP16[$24>>1]|0;
  $26 = $25 << 16 >> 16;
  $27 = Math_imul($23, $26)|0;
  $28 = (($21) + ($27))|0;
  $12 = $28;
  $29 = $12;
  $30 = $29 >> 16;
  $31 = $30&65535;
  $11 = $31;
  $32 = $11;
  $33 = $9;
  $34 = ((($33)) + 2|0);
  $9 = $34;
  HEAP16[$33>>1] = $32;
  $35 = $5;
  $36 = HEAP16[$35>>1]|0;
  $37 = $36 << 16 >> 16;
  $38 = $37 << 14;
  $13 = $38;
  $39 = $7;
  $40 = $39 << 16 >> 16;
  $41 = $11;
  $42 = $41 << 16 >> 16;
  $43 = Math_imul($40, $42)|0;
  $44 = $13;
  $45 = (($44) - ($43))|0;
  $13 = $45;
  $46 = $13;
  $47 = $46 << 1;
  $13 = $47;
  $48 = $5;
  $49 = ((($48)) + 4|0);
  $5 = $49;
  $50 = $10;
  $51 = (($50) + 1)|0;
  $10 = $51;
 }
 $52 = $21 >> 16;
 $53 = $52&65535;
 $54 = $8;
 HEAP16[$54>>1] = $53;
 STACKTOP = sp;return;
}
function _WebRtcVad_GaussianProbability($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $11 = 0;
 $13 = $6;
 $14 = $13 << 16 >> 16;
 $15 = $14 >> 1;
 $16 = (131072 + ($15))|0;
 $12 = $16;
 $17 = $12;
 $18 = $6;
 $19 = (_WebRtcSpl_DivW32W16($17,$18)|0);
 $20 = $19&65535;
 $9 = $20;
 $21 = $9;
 $22 = $21 << 16 >> 16;
 $23 = $22 >> 2;
 $24 = $23&65535;
 $8 = $24;
 $25 = $8;
 $26 = $25 << 16 >> 16;
 $27 = $8;
 $28 = $27 << 16 >> 16;
 $29 = Math_imul($26, $28)|0;
 $30 = $29 >> 2;
 $31 = $30&65535;
 $10 = $31;
 $32 = $4;
 $33 = $32 << 16 >> 16;
 $34 = $33 << 3;
 $35 = $34&65535;
 $8 = $35;
 $36 = $8;
 $37 = $36 << 16 >> 16;
 $38 = $5;
 $39 = $38 << 16 >> 16;
 $40 = (($37) - ($39))|0;
 $41 = $40&65535;
 $8 = $41;
 $42 = $10;
 $43 = $42 << 16 >> 16;
 $44 = $8;
 $45 = $44 << 16 >> 16;
 $46 = Math_imul($43, $45)|0;
 $47 = $46 >> 10;
 $48 = $47&65535;
 $49 = $7;
 HEAP16[$49>>1] = $48;
 $50 = $7;
 $51 = HEAP16[$50>>1]|0;
 $52 = $51 << 16 >> 16;
 $53 = $8;
 $54 = $53 << 16 >> 16;
 $55 = Math_imul($52, $54)|0;
 $56 = $55 >> 9;
 $12 = $56;
 $57 = $12;
 $58 = ($57|0)<(22005);
 if (!($58)) {
  $92 = $9;
  $93 = $92 << 16 >> 16;
  $94 = $11;
  $95 = $94 << 16 >> 16;
  $96 = Math_imul($93, $95)|0;
  STACKTOP = sp;return ($96|0);
 }
 $59 = $12;
 $60 = $59&65535;
 $61 = $60 << 16 >> 16;
 $62 = ($61*5909)|0;
 $63 = $62 >> 12;
 $64 = $63&65535;
 $8 = $64;
 $65 = $8;
 $66 = $65 << 16 >> 16;
 $67 = (0 - ($66))|0;
 $68 = $67&65535;
 $8 = $68;
 $69 = $8;
 $70 = $69 << 16 >> 16;
 $71 = $70 & 1023;
 $72 = 1024 | $71;
 $73 = $72&65535;
 $11 = $73;
 $74 = $8;
 $75 = $74 << 16 >> 16;
 $76 = $75 ^ 65535;
 $77 = $76&65535;
 $8 = $77;
 $78 = $8;
 $79 = $78 << 16 >> 16;
 $80 = $79 >> 10;
 $81 = $80&65535;
 $8 = $81;
 $82 = $8;
 $83 = $82 << 16 >> 16;
 $84 = (($83) + 1)|0;
 $85 = $84&65535;
 $8 = $85;
 $86 = $8;
 $87 = $86 << 16 >> 16;
 $88 = $11;
 $89 = $88 << 16 >> 16;
 $90 = $89 >> $87;
 $91 = $90&65535;
 $11 = $91;
 $92 = $9;
 $93 = $92 << 16 >> 16;
 $94 = $11;
 $95 = $94 << 16 >> 16;
 $96 = Math_imul($93, $95)|0;
 STACKTOP = sp;return ($96|0);
}
function _WebRtcVad_Downsampling($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = 0;
 $9 = 0;
 $14 = $6;
 $15 = HEAP32[$14>>2]|0;
 $10 = $15;
 $16 = $6;
 $17 = ((($16)) + 4|0);
 $18 = HEAP32[$17>>2]|0;
 $11 = $18;
 $12 = 0;
 $19 = $7;
 $20 = $19 >> 1;
 $13 = $20;
 $12 = 0;
 while(1) {
  $21 = $12;
  $22 = $13;
  $23 = ($21|0)<($22|0);
  $24 = $10;
  if (!($23)) {
   break;
  }
  $25 = $24 >> 1;
  $26 = HEAP16[360]|0;
  $27 = $26 << 16 >> 16;
  $28 = $4;
  $29 = HEAP16[$28>>1]|0;
  $30 = $29 << 16 >> 16;
  $31 = Math_imul($27, $30)|0;
  $32 = $31 >> 14;
  $33 = (($25) + ($32))|0;
  $34 = $33&65535;
  $8 = $34;
  $35 = $8;
  $36 = $5;
  HEAP16[$36>>1] = $35;
  $37 = $4;
  $38 = ((($37)) + 2|0);
  $4 = $38;
  $39 = HEAP16[$37>>1]|0;
  $40 = $39 << 16 >> 16;
  $41 = HEAP16[360]|0;
  $42 = $41 << 16 >> 16;
  $43 = $8;
  $44 = $43 << 16 >> 16;
  $45 = Math_imul($42, $44)|0;
  $46 = $45 >> 12;
  $47 = (($40) - ($46))|0;
  $10 = $47;
  $48 = $11;
  $49 = $48 >> 1;
  $50 = HEAP16[(722)>>1]|0;
  $51 = $50 << 16 >> 16;
  $52 = $4;
  $53 = HEAP16[$52>>1]|0;
  $54 = $53 << 16 >> 16;
  $55 = Math_imul($51, $54)|0;
  $56 = $55 >> 14;
  $57 = (($49) + ($56))|0;
  $58 = $57&65535;
  $9 = $58;
  $59 = $9;
  $60 = $59 << 16 >> 16;
  $61 = $5;
  $62 = ((($61)) + 2|0);
  $5 = $62;
  $63 = HEAP16[$61>>1]|0;
  $64 = $63 << 16 >> 16;
  $65 = (($64) + ($60))|0;
  $66 = $65&65535;
  HEAP16[$61>>1] = $66;
  $67 = $4;
  $68 = ((($67)) + 2|0);
  $4 = $68;
  $69 = HEAP16[$67>>1]|0;
  $70 = $69 << 16 >> 16;
  $71 = HEAP16[(722)>>1]|0;
  $72 = $71 << 16 >> 16;
  $73 = $9;
  $74 = $73 << 16 >> 16;
  $75 = Math_imul($72, $74)|0;
  $76 = $75 >> 12;
  $77 = (($70) - ($76))|0;
  $11 = $77;
  $78 = $12;
  $79 = (($78) + 1)|0;
  $12 = $79;
 }
 $80 = $6;
 HEAP32[$80>>2] = $24;
 $81 = $11;
 $82 = $6;
 $83 = ((($82)) + 4|0);
 HEAP32[$83>>2] = $81;
 STACKTOP = sp;return;
}
function _WebRtcVad_FindMinimum($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0;
 var $245 = 0, $246 = 0, $247 = 0, $248 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0;
 var $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 0;
 $7 = 0;
 $8 = -1;
 $15 = $5;
 $16 = $15 << 4;
 $9 = $16;
 $10 = 1600;
 $11 = 0;
 $12 = 0;
 $17 = $3;
 $18 = ((($17)) + 284|0);
 $19 = $9;
 $20 = (($18) + ($19<<1)|0);
 $13 = $20;
 $21 = $3;
 $22 = ((($21)) + 476|0);
 $23 = $9;
 $24 = (($22) + ($23<<1)|0);
 $14 = $24;
 $25 = $5;
 $26 = ($25|0)<(6);
 if (!($26)) {
  ___assert_fail((3776|0),(3799|0),76,(3832|0));
  // unreachable;
 }
 $6 = 0;
 while(1) {
  $27 = $6;
  $28 = ($27|0)<(16);
  if (!($28)) {
   break;
  }
  $29 = $13;
  $30 = $6;
  $31 = (($29) + ($30<<1)|0);
  $32 = HEAP16[$31>>1]|0;
  $33 = $32 << 16 >> 16;
  $34 = ($33|0)!=(100);
  if ($34) {
   $35 = $13;
   $36 = $6;
   $37 = (($35) + ($36<<1)|0);
   $38 = HEAP16[$37>>1]|0;
   $39 = (($38) + 1)<<16>>16;
   HEAP16[$37>>1] = $39;
  } else {
   $40 = $6;
   $7 = $40;
   while(1) {
    $41 = $7;
    $42 = ($41|0)<(16);
    if (!($42)) {
     break;
    }
    $43 = $14;
    $44 = $7;
    $45 = (($44) + 1)|0;
    $46 = (($43) + ($45<<1)|0);
    $47 = HEAP16[$46>>1]|0;
    $48 = $14;
    $49 = $7;
    $50 = (($48) + ($49<<1)|0);
    HEAP16[$50>>1] = $47;
    $51 = $13;
    $52 = $7;
    $53 = (($52) + 1)|0;
    $54 = (($51) + ($53<<1)|0);
    $55 = HEAP16[$54>>1]|0;
    $56 = $13;
    $57 = $7;
    $58 = (($56) + ($57<<1)|0);
    HEAP16[$58>>1] = $55;
    $59 = $7;
    $60 = (($59) + 1)|0;
    $7 = $60;
   }
   $61 = $13;
   $62 = ((($61)) + 30|0);
   HEAP16[$62>>1] = 101;
   $63 = $14;
   $64 = ((($63)) + 30|0);
   HEAP16[$64>>1] = 10000;
  }
  $65 = $6;
  $66 = (($65) + 1)|0;
  $6 = $66;
 }
 $67 = $4;
 $68 = $67 << 16 >> 16;
 $69 = $14;
 $70 = ((($69)) + 14|0);
 $71 = HEAP16[$70>>1]|0;
 $72 = $71 << 16 >> 16;
 $73 = ($68|0)<($72|0);
 $74 = $4;
 $75 = $74 << 16 >> 16;
 $76 = $14;
 do {
  if ($73) {
   $77 = ((($76)) + 6|0);
   $78 = HEAP16[$77>>1]|0;
   $79 = $78 << 16 >> 16;
   $80 = ($75|0)<($79|0);
   $81 = $4;
   $82 = $81 << 16 >> 16;
   $83 = $14;
   if ($80) {
    $84 = ((($83)) + 2|0);
    $85 = HEAP16[$84>>1]|0;
    $86 = $85 << 16 >> 16;
    $87 = ($82|0)<($86|0);
    $88 = $4;
    $89 = $88 << 16 >> 16;
    $90 = $14;
    if ($87) {
     $91 = HEAP16[$90>>1]|0;
     $92 = $91 << 16 >> 16;
     $93 = ($89|0)<($92|0);
     if ($93) {
      $8 = 0;
      break;
     } else {
      $8 = 1;
      break;
     }
    } else {
     $94 = ((($90)) + 4|0);
     $95 = HEAP16[$94>>1]|0;
     $96 = $95 << 16 >> 16;
     $97 = ($89|0)<($96|0);
     if ($97) {
      $8 = 2;
      break;
     } else {
      $8 = 3;
      break;
     }
    }
   } else {
    $98 = ((($83)) + 10|0);
    $99 = HEAP16[$98>>1]|0;
    $100 = $99 << 16 >> 16;
    $101 = ($82|0)<($100|0);
    $102 = $4;
    $103 = $102 << 16 >> 16;
    $104 = $14;
    if ($101) {
     $105 = ((($104)) + 8|0);
     $106 = HEAP16[$105>>1]|0;
     $107 = $106 << 16 >> 16;
     $108 = ($103|0)<($107|0);
     if ($108) {
      $8 = 4;
      break;
     } else {
      $8 = 5;
      break;
     }
    } else {
     $109 = ((($104)) + 12|0);
     $110 = HEAP16[$109>>1]|0;
     $111 = $110 << 16 >> 16;
     $112 = ($103|0)<($111|0);
     if ($112) {
      $8 = 6;
      break;
     } else {
      $8 = 7;
      break;
     }
    }
   }
  } else {
   $113 = ((($76)) + 30|0);
   $114 = HEAP16[$113>>1]|0;
   $115 = $114 << 16 >> 16;
   $116 = ($75|0)<($115|0);
   if ($116) {
    $117 = $4;
    $118 = $117 << 16 >> 16;
    $119 = $14;
    $120 = ((($119)) + 22|0);
    $121 = HEAP16[$120>>1]|0;
    $122 = $121 << 16 >> 16;
    $123 = ($118|0)<($122|0);
    $124 = $4;
    $125 = $124 << 16 >> 16;
    $126 = $14;
    if ($123) {
     $127 = ((($126)) + 18|0);
     $128 = HEAP16[$127>>1]|0;
     $129 = $128 << 16 >> 16;
     $130 = ($125|0)<($129|0);
     $131 = $4;
     $132 = $131 << 16 >> 16;
     $133 = $14;
     if ($130) {
      $134 = ((($133)) + 16|0);
      $135 = HEAP16[$134>>1]|0;
      $136 = $135 << 16 >> 16;
      $137 = ($132|0)<($136|0);
      if ($137) {
       $8 = 8;
       break;
      } else {
       $8 = 9;
       break;
      }
     } else {
      $138 = ((($133)) + 20|0);
      $139 = HEAP16[$138>>1]|0;
      $140 = $139 << 16 >> 16;
      $141 = ($132|0)<($140|0);
      if ($141) {
       $8 = 10;
       break;
      } else {
       $8 = 11;
       break;
      }
     }
    } else {
     $142 = ((($126)) + 26|0);
     $143 = HEAP16[$142>>1]|0;
     $144 = $143 << 16 >> 16;
     $145 = ($125|0)<($144|0);
     $146 = $4;
     $147 = $146 << 16 >> 16;
     $148 = $14;
     if ($145) {
      $149 = ((($148)) + 24|0);
      $150 = HEAP16[$149>>1]|0;
      $151 = $150 << 16 >> 16;
      $152 = ($147|0)<($151|0);
      if ($152) {
       $8 = 12;
       break;
      } else {
       $8 = 13;
       break;
      }
     } else {
      $153 = ((($148)) + 28|0);
      $154 = HEAP16[$153>>1]|0;
      $155 = $154 << 16 >> 16;
      $156 = ($147|0)<($155|0);
      if ($156) {
       $8 = 14;
       break;
      } else {
       $8 = 15;
       break;
      }
     }
    }
   }
  }
 } while(0);
 $157 = $8;
 $158 = ($157|0)>(-1);
 if ($158) {
  $6 = 15;
  while(1) {
   $159 = $6;
   $160 = $8;
   $161 = ($159|0)>($160|0);
   if (!($161)) {
    break;
   }
   $162 = $14;
   $163 = $6;
   $164 = (($163) - 1)|0;
   $165 = (($162) + ($164<<1)|0);
   $166 = HEAP16[$165>>1]|0;
   $167 = $14;
   $168 = $6;
   $169 = (($167) + ($168<<1)|0);
   HEAP16[$169>>1] = $166;
   $170 = $13;
   $171 = $6;
   $172 = (($171) - 1)|0;
   $173 = (($170) + ($172<<1)|0);
   $174 = HEAP16[$173>>1]|0;
   $175 = $13;
   $176 = $6;
   $177 = (($175) + ($176<<1)|0);
   HEAP16[$177>>1] = $174;
   $178 = $6;
   $179 = (($178) + -1)|0;
   $6 = $179;
  }
  $180 = $4;
  $181 = $14;
  $182 = $8;
  $183 = (($181) + ($182<<1)|0);
  HEAP16[$183>>1] = $180;
  $184 = $13;
  $185 = $8;
  $186 = (($184) + ($185<<1)|0);
  HEAP16[$186>>1] = 1;
 }
 $187 = $3;
 $188 = ((($187)) + 276|0);
 $189 = HEAP32[$188>>2]|0;
 $190 = ($189|0)>(2);
 if ($190) {
  $191 = $14;
  $192 = ((($191)) + 4|0);
  $193 = HEAP16[$192>>1]|0;
  $10 = $193;
 } else {
  $194 = $3;
  $195 = ((($194)) + 276|0);
  $196 = HEAP32[$195>>2]|0;
  $197 = ($196|0)>(0);
  if ($197) {
   $198 = $14;
   $199 = HEAP16[$198>>1]|0;
   $10 = $199;
  }
 }
 $200 = $3;
 $201 = ((($200)) + 276|0);
 $202 = HEAP32[$201>>2]|0;
 $203 = ($202|0)>(0);
 do {
  if ($203) {
   $204 = $10;
   $205 = $204 << 16 >> 16;
   $206 = $3;
   $207 = ((($206)) + 668|0);
   $208 = $5;
   $209 = (($207) + ($208<<1)|0);
   $210 = HEAP16[$209>>1]|0;
   $211 = $210 << 16 >> 16;
   $212 = ($205|0)<($211|0);
   if ($212) {
    $11 = 6553;
    break;
   } else {
    $11 = 32439;
    break;
   }
  }
 } while(0);
 $213 = $11;
 $214 = $213 << 16 >> 16;
 $215 = (($214) + 1)|0;
 $216 = $215&65535;
 $217 = $216 << 16 >> 16;
 $218 = $3;
 $219 = ((($218)) + 668|0);
 $220 = $5;
 $221 = (($219) + ($220<<1)|0);
 $222 = HEAP16[$221>>1]|0;
 $223 = $222 << 16 >> 16;
 $224 = Math_imul($217, $223)|0;
 $12 = $224;
 $225 = $11;
 $226 = $225 << 16 >> 16;
 $227 = (32767 - ($226))|0;
 $228 = $227&65535;
 $229 = $228 << 16 >> 16;
 $230 = $10;
 $231 = $230 << 16 >> 16;
 $232 = Math_imul($229, $231)|0;
 $233 = $12;
 $234 = (($233) + ($232))|0;
 $12 = $234;
 $235 = $12;
 $236 = (($235) + 16384)|0;
 $12 = $236;
 $237 = $12;
 $238 = $237 >> 15;
 $239 = $238&65535;
 $240 = $3;
 $241 = ((($240)) + 668|0);
 $242 = $5;
 $243 = (($241) + ($242<<1)|0);
 HEAP16[$243>>1] = $239;
 $244 = $3;
 $245 = ((($244)) + 668|0);
 $246 = $5;
 $247 = (($245) + ($246<<1)|0);
 $248 = HEAP16[$247>>1]|0;
 STACKTOP = sp;return ($248|0);
}
function _WebRtcSpl_Init() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _once(4);
 return;
}
function _InitFunctionPointers() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _InitPointersToC();
 return;
}
function _once($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 (_pthread_once((6336|0),($2|0))|0);
 STACKTOP = sp;return;
}
function _InitPointersToC() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[1571] = 5;
 HEAP32[1572] = 6;
 HEAP32[1573] = 7;
 HEAP32[1574] = 8;
 HEAP32[1575] = 9;
 HEAP32[1576] = 10;
 HEAP32[1577] = 11;
 HEAP32[1578] = 12;
 HEAP32[1579] = 13;
 HEAP32[1580] = 14;
 HEAP32[1581] = 15;
 HEAP32[1582] = 16;
 HEAP32[1583] = 17;
 return;
}
function _WebRtcSpl_DivW32W16($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $4;
 $6 = $5 << 16 >> 16;
 $7 = ($6|0)!=(0);
 if ($7) {
  $8 = $3;
  $9 = $4;
  $10 = $9 << 16 >> 16;
  $11 = (($8|0) / ($10|0))&-1;
  $2 = $11;
  $12 = $2;
  STACKTOP = sp;return ($12|0);
 } else {
  $2 = 2147483647;
  $12 = $2;
  STACKTOP = sp;return ($12|0);
 }
 return (0)|0;
}
function _WebRtcSpl_Resample48khzTo8khz($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $4;
 $9 = $7;
 $10 = ((($9)) + 1024|0);
 $11 = $6;
 _WebRtcSpl_DownBy2ShortToInt($8,480,$10,$11);
 $12 = $7;
 $13 = ((($12)) + 1024|0);
 $14 = $7;
 $15 = ((($14)) + 64|0);
 $16 = $6;
 $17 = ((($16)) + 32|0);
 _WebRtcSpl_LPBy2IntToInt($13,240,$15,$17);
 $18 = $7;
 $19 = ((($18)) + 32|0);
 $20 = $6;
 $21 = ((($20)) + 96|0);
 ;HEAP32[$19>>2]=HEAP32[$21>>2]|0;HEAP32[$19+4>>2]=HEAP32[$21+4>>2]|0;HEAP32[$19+8>>2]=HEAP32[$21+8>>2]|0;HEAP32[$19+12>>2]=HEAP32[$21+12>>2]|0;HEAP32[$19+16>>2]=HEAP32[$21+16>>2]|0;HEAP32[$19+20>>2]=HEAP32[$21+20>>2]|0;HEAP32[$19+24>>2]=HEAP32[$21+24>>2]|0;HEAP32[$19+28>>2]=HEAP32[$21+28>>2]|0;
 $22 = $6;
 $23 = ((($22)) + 96|0);
 $24 = $7;
 $25 = ((($24)) + 992|0);
 ;HEAP32[$23>>2]=HEAP32[$25>>2]|0;HEAP32[$23+4>>2]=HEAP32[$25+4>>2]|0;HEAP32[$23+8>>2]=HEAP32[$25+8>>2]|0;HEAP32[$23+12>>2]=HEAP32[$25+12>>2]|0;HEAP32[$23+16>>2]=HEAP32[$25+16>>2]|0;HEAP32[$23+20>>2]=HEAP32[$25+20>>2]|0;HEAP32[$23+24>>2]=HEAP32[$25+24>>2]|0;HEAP32[$23+28>>2]=HEAP32[$25+28>>2]|0;
 $26 = $7;
 $27 = ((($26)) + 32|0);
 $28 = $7;
 _WebRtcSpl_Resample48khzTo32khz($27,$28,80);
 $29 = $7;
 $30 = $5;
 $31 = $6;
 $32 = ((($31)) + 128|0);
 _WebRtcSpl_DownBy2IntToShort($29,160,$30,$32);
 STACKTOP = sp;return;
}
function _WebRtcSpl_ResetResample48khzTo8khz($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 ;HEAP32[$2>>2]=0|0;HEAP32[$2+4>>2]=0|0;HEAP32[$2+8>>2]=0|0;HEAP32[$2+12>>2]=0|0;HEAP32[$2+16>>2]=0|0;HEAP32[$2+20>>2]=0|0;HEAP32[$2+24>>2]=0|0;HEAP32[$2+28>>2]=0|0;
 $3 = $1;
 $4 = ((($3)) + 32|0);
 dest=$4; stop=dest+64|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $5 = $1;
 $6 = ((($5)) + 96|0);
 ;HEAP32[$6>>2]=0|0;HEAP32[$6+4>>2]=0|0;HEAP32[$6+8>>2]=0|0;HEAP32[$6+12>>2]=0|0;HEAP32[$6+16>>2]=0|0;HEAP32[$6+20>>2]=0|0;HEAP32[$6+24>>2]=0|0;HEAP32[$6+28>>2]=0|0;
 $7 = $1;
 $8 = ((($7)) + 128|0);
 ;HEAP32[$8>>2]=0|0;HEAP32[$8+4>>2]=0|0;HEAP32[$8+8>>2]=0|0;HEAP32[$8+12>>2]=0|0;HEAP32[$8+16>>2]=0|0;HEAP32[$8+20>>2]=0|0;HEAP32[$8+24>>2]=0|0;HEAP32[$8+28>>2]=0|0;
 STACKTOP = sp;return;
}
function _WebRtcSpl_Energy($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 0;
 $11 = $3;
 $12 = $4;
 $13 = $4;
 $14 = (_WebRtcSpl_GetScalingSquare($11,$12,$13)|0);
 $8 = $14;
 $15 = $4;
 $9 = $15;
 $16 = $3;
 $10 = $16;
 $7 = 0;
 while(1) {
  $17 = $7;
  $18 = $9;
  $19 = ($17|0)<($18|0);
  if (!($19)) {
   break;
  }
  $20 = $10;
  $21 = HEAP16[$20>>1]|0;
  $22 = $21 << 16 >> 16;
  $23 = $10;
  $24 = HEAP16[$23>>1]|0;
  $25 = $24 << 16 >> 16;
  $26 = Math_imul($22, $25)|0;
  $27 = $8;
  $28 = $26 >> $27;
  $29 = $6;
  $30 = (($29) + ($28))|0;
  $6 = $30;
  $31 = $10;
  $32 = ((($31)) + 2|0);
  $10 = $32;
  $33 = $7;
  $34 = (($33) + 1)|0;
  $7 = $34;
 }
 $35 = $8;
 $36 = $5;
 HEAP32[$36>>2] = $35;
 $37 = $6;
 STACKTOP = sp;return ($37|0);
}
function _WebRtcSpl_Resample48khzTo32khz($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0;
 var $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = 0;
 while(1) {
  $8 = $7;
  $9 = $5;
  $10 = ($8|0)<($9|0);
  if (!($10)) {
   break;
  }
  $6 = 16384;
  $11 = HEAP16[362]|0;
  $12 = $11 << 16 >> 16;
  $13 = $3;
  $14 = HEAP32[$13>>2]|0;
  $15 = Math_imul($12, $14)|0;
  $16 = $6;
  $17 = (($16) + ($15))|0;
  $6 = $17;
  $18 = HEAP16[(726)>>1]|0;
  $19 = $18 << 16 >> 16;
  $20 = $3;
  $21 = ((($20)) + 4|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = Math_imul($19, $22)|0;
  $24 = $6;
  $25 = (($24) + ($23))|0;
  $6 = $25;
  $26 = HEAP16[(728)>>1]|0;
  $27 = $26 << 16 >> 16;
  $28 = $3;
  $29 = ((($28)) + 8|0);
  $30 = HEAP32[$29>>2]|0;
  $31 = Math_imul($27, $30)|0;
  $32 = $6;
  $33 = (($32) + ($31))|0;
  $6 = $33;
  $34 = HEAP16[(730)>>1]|0;
  $35 = $34 << 16 >> 16;
  $36 = $3;
  $37 = ((($36)) + 12|0);
  $38 = HEAP32[$37>>2]|0;
  $39 = Math_imul($35, $38)|0;
  $40 = $6;
  $41 = (($40) + ($39))|0;
  $6 = $41;
  $42 = HEAP16[(732)>>1]|0;
  $43 = $42 << 16 >> 16;
  $44 = $3;
  $45 = ((($44)) + 16|0);
  $46 = HEAP32[$45>>2]|0;
  $47 = Math_imul($43, $46)|0;
  $48 = $6;
  $49 = (($48) + ($47))|0;
  $6 = $49;
  $50 = HEAP16[(734)>>1]|0;
  $51 = $50 << 16 >> 16;
  $52 = $3;
  $53 = ((($52)) + 20|0);
  $54 = HEAP32[$53>>2]|0;
  $55 = Math_imul($51, $54)|0;
  $56 = $6;
  $57 = (($56) + ($55))|0;
  $6 = $57;
  $58 = HEAP16[(736)>>1]|0;
  $59 = $58 << 16 >> 16;
  $60 = $3;
  $61 = ((($60)) + 24|0);
  $62 = HEAP32[$61>>2]|0;
  $63 = Math_imul($59, $62)|0;
  $64 = $6;
  $65 = (($64) + ($63))|0;
  $6 = $65;
  $66 = HEAP16[(738)>>1]|0;
  $67 = $66 << 16 >> 16;
  $68 = $3;
  $69 = ((($68)) + 28|0);
  $70 = HEAP32[$69>>2]|0;
  $71 = Math_imul($67, $70)|0;
  $72 = $6;
  $73 = (($72) + ($71))|0;
  $6 = $73;
  $74 = $6;
  $75 = $4;
  HEAP32[$75>>2] = $74;
  $6 = 16384;
  $76 = HEAP16[(740)>>1]|0;
  $77 = $76 << 16 >> 16;
  $78 = $3;
  $79 = ((($78)) + 4|0);
  $80 = HEAP32[$79>>2]|0;
  $81 = Math_imul($77, $80)|0;
  $82 = $6;
  $83 = (($82) + ($81))|0;
  $6 = $83;
  $84 = HEAP16[(742)>>1]|0;
  $85 = $84 << 16 >> 16;
  $86 = $3;
  $87 = ((($86)) + 8|0);
  $88 = HEAP32[$87>>2]|0;
  $89 = Math_imul($85, $88)|0;
  $90 = $6;
  $91 = (($90) + ($89))|0;
  $6 = $91;
  $92 = HEAP16[(744)>>1]|0;
  $93 = $92 << 16 >> 16;
  $94 = $3;
  $95 = ((($94)) + 12|0);
  $96 = HEAP32[$95>>2]|0;
  $97 = Math_imul($93, $96)|0;
  $98 = $6;
  $99 = (($98) + ($97))|0;
  $6 = $99;
  $100 = HEAP16[(746)>>1]|0;
  $101 = $100 << 16 >> 16;
  $102 = $3;
  $103 = ((($102)) + 16|0);
  $104 = HEAP32[$103>>2]|0;
  $105 = Math_imul($101, $104)|0;
  $106 = $6;
  $107 = (($106) + ($105))|0;
  $6 = $107;
  $108 = HEAP16[(748)>>1]|0;
  $109 = $108 << 16 >> 16;
  $110 = $3;
  $111 = ((($110)) + 20|0);
  $112 = HEAP32[$111>>2]|0;
  $113 = Math_imul($109, $112)|0;
  $114 = $6;
  $115 = (($114) + ($113))|0;
  $6 = $115;
  $116 = HEAP16[(750)>>1]|0;
  $117 = $116 << 16 >> 16;
  $118 = $3;
  $119 = ((($118)) + 24|0);
  $120 = HEAP32[$119>>2]|0;
  $121 = Math_imul($117, $120)|0;
  $122 = $6;
  $123 = (($122) + ($121))|0;
  $6 = $123;
  $124 = HEAP16[(752)>>1]|0;
  $125 = $124 << 16 >> 16;
  $126 = $3;
  $127 = ((($126)) + 28|0);
  $128 = HEAP32[$127>>2]|0;
  $129 = Math_imul($125, $128)|0;
  $130 = $6;
  $131 = (($130) + ($129))|0;
  $6 = $131;
  $132 = HEAP16[(754)>>1]|0;
  $133 = $132 << 16 >> 16;
  $134 = $3;
  $135 = ((($134)) + 32|0);
  $136 = HEAP32[$135>>2]|0;
  $137 = Math_imul($133, $136)|0;
  $138 = $6;
  $139 = (($138) + ($137))|0;
  $6 = $139;
  $140 = $6;
  $141 = $4;
  $142 = ((($141)) + 4|0);
  HEAP32[$142>>2] = $140;
  $143 = $3;
  $144 = ((($143)) + 12|0);
  $3 = $144;
  $145 = $4;
  $146 = ((($145)) + 8|0);
  $4 = $146;
  $147 = $7;
  $148 = (($147) + 1)|0;
  $7 = $148;
 }
 STACKTOP = sp;return;
}
function _WebRtcSpl_DownBy2IntToShort($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0;
 var $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $12 = $5;
 $13 = $12 >> 1;
 $5 = $13;
 $11 = 0;
 while(1) {
  $14 = $11;
  $15 = $5;
  $16 = ($14|0)<($15|0);
  $17 = $4;
  if (!($16)) {
   break;
  }
  $18 = $11;
  $19 = $18 << 1;
  $20 = (($17) + ($19<<2)|0);
  $21 = HEAP32[$20>>2]|0;
  $8 = $21;
  $22 = $8;
  $23 = $7;
  $24 = ((($23)) + 4|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = (($22) - ($25))|0;
  $10 = $26;
  $27 = $10;
  $28 = (($27) + 8192)|0;
  $29 = $28 >> 14;
  $10 = $29;
  $30 = $7;
  $31 = HEAP32[$30>>2]|0;
  $32 = $10;
  $33 = HEAP16[(762)>>1]|0;
  $34 = $33 << 16 >> 16;
  $35 = Math_imul($32, $34)|0;
  $36 = (($31) + ($35))|0;
  $9 = $36;
  $37 = $8;
  $38 = $7;
  HEAP32[$38>>2] = $37;
  $39 = $9;
  $40 = $7;
  $41 = ((($40)) + 8|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = (($39) - ($42))|0;
  $10 = $43;
  $44 = $10;
  $45 = $44 >> 14;
  $10 = $45;
  $46 = $10;
  $47 = ($46|0)<(0);
  if ($47) {
   $48 = $10;
   $49 = (($48) + 1)|0;
   $10 = $49;
  }
  $50 = $7;
  $51 = ((($50)) + 4|0);
  $52 = HEAP32[$51>>2]|0;
  $53 = $10;
  $54 = HEAP16[(764)>>1]|0;
  $55 = $54 << 16 >> 16;
  $56 = Math_imul($53, $55)|0;
  $57 = (($52) + ($56))|0;
  $8 = $57;
  $58 = $9;
  $59 = $7;
  $60 = ((($59)) + 4|0);
  HEAP32[$60>>2] = $58;
  $61 = $8;
  $62 = $7;
  $63 = ((($62)) + 12|0);
  $64 = HEAP32[$63>>2]|0;
  $65 = (($61) - ($64))|0;
  $10 = $65;
  $66 = $10;
  $67 = $66 >> 14;
  $10 = $67;
  $68 = $10;
  $69 = ($68|0)<(0);
  if ($69) {
   $70 = $10;
   $71 = (($70) + 1)|0;
   $10 = $71;
  }
  $72 = $7;
  $73 = ((($72)) + 8|0);
  $74 = HEAP32[$73>>2]|0;
  $75 = $10;
  $76 = HEAP16[(766)>>1]|0;
  $77 = $76 << 16 >> 16;
  $78 = Math_imul($75, $77)|0;
  $79 = (($74) + ($78))|0;
  $80 = $7;
  $81 = ((($80)) + 12|0);
  HEAP32[$81>>2] = $79;
  $82 = $8;
  $83 = $7;
  $84 = ((($83)) + 8|0);
  HEAP32[$84>>2] = $82;
  $85 = $7;
  $86 = ((($85)) + 12|0);
  $87 = HEAP32[$86>>2]|0;
  $88 = $87 >> 1;
  $89 = $4;
  $90 = $11;
  $91 = $90 << 1;
  $92 = (($89) + ($91<<2)|0);
  HEAP32[$92>>2] = $88;
  $93 = $11;
  $94 = (($93) + 1)|0;
  $11 = $94;
 }
 $95 = ((($17)) + 4|0);
 $4 = $95;
 $11 = 0;
 while(1) {
  $96 = $11;
  $97 = $5;
  $98 = ($96|0)<($97|0);
  $99 = $4;
  if (!($98)) {
   break;
  }
  $100 = $11;
  $101 = $100 << 1;
  $102 = (($99) + ($101<<2)|0);
  $103 = HEAP32[$102>>2]|0;
  $8 = $103;
  $104 = $8;
  $105 = $7;
  $106 = ((($105)) + 20|0);
  $107 = HEAP32[$106>>2]|0;
  $108 = (($104) - ($107))|0;
  $10 = $108;
  $109 = $10;
  $110 = (($109) + 8192)|0;
  $111 = $110 >> 14;
  $10 = $111;
  $112 = $7;
  $113 = ((($112)) + 16|0);
  $114 = HEAP32[$113>>2]|0;
  $115 = $10;
  $116 = HEAP16[378]|0;
  $117 = $116 << 16 >> 16;
  $118 = Math_imul($115, $117)|0;
  $119 = (($114) + ($118))|0;
  $9 = $119;
  $120 = $8;
  $121 = $7;
  $122 = ((($121)) + 16|0);
  HEAP32[$122>>2] = $120;
  $123 = $9;
  $124 = $7;
  $125 = ((($124)) + 24|0);
  $126 = HEAP32[$125>>2]|0;
  $127 = (($123) - ($126))|0;
  $10 = $127;
  $128 = $10;
  $129 = $128 >> 14;
  $10 = $129;
  $130 = $10;
  $131 = ($130|0)<(0);
  if ($131) {
   $132 = $10;
   $133 = (($132) + 1)|0;
   $10 = $133;
  }
  $134 = $7;
  $135 = ((($134)) + 20|0);
  $136 = HEAP32[$135>>2]|0;
  $137 = $10;
  $138 = HEAP16[(758)>>1]|0;
  $139 = $138 << 16 >> 16;
  $140 = Math_imul($137, $139)|0;
  $141 = (($136) + ($140))|0;
  $8 = $141;
  $142 = $9;
  $143 = $7;
  $144 = ((($143)) + 20|0);
  HEAP32[$144>>2] = $142;
  $145 = $8;
  $146 = $7;
  $147 = ((($146)) + 28|0);
  $148 = HEAP32[$147>>2]|0;
  $149 = (($145) - ($148))|0;
  $10 = $149;
  $150 = $10;
  $151 = $150 >> 14;
  $10 = $151;
  $152 = $10;
  $153 = ($152|0)<(0);
  if ($153) {
   $154 = $10;
   $155 = (($154) + 1)|0;
   $10 = $155;
  }
  $156 = $7;
  $157 = ((($156)) + 24|0);
  $158 = HEAP32[$157>>2]|0;
  $159 = $10;
  $160 = HEAP16[(760)>>1]|0;
  $161 = $160 << 16 >> 16;
  $162 = Math_imul($159, $161)|0;
  $163 = (($158) + ($162))|0;
  $164 = $7;
  $165 = ((($164)) + 28|0);
  HEAP32[$165>>2] = $163;
  $166 = $8;
  $167 = $7;
  $168 = ((($167)) + 24|0);
  HEAP32[$168>>2] = $166;
  $169 = $7;
  $170 = ((($169)) + 28|0);
  $171 = HEAP32[$170>>2]|0;
  $172 = $171 >> 1;
  $173 = $4;
  $174 = $11;
  $175 = $174 << 1;
  $176 = (($173) + ($175<<2)|0);
  HEAP32[$176>>2] = $172;
  $177 = $11;
  $178 = (($177) + 1)|0;
  $11 = $178;
 }
 $179 = ((($99)) + -4|0);
 $4 = $179;
 $11 = 0;
 while(1) {
  $180 = $11;
  $181 = $5;
  $182 = ($180|0)<($181|0);
  if (!($182)) {
   break;
  }
  $183 = $4;
  $184 = $11;
  $185 = $184 << 1;
  $186 = (($183) + ($185<<2)|0);
  $187 = HEAP32[$186>>2]|0;
  $188 = $4;
  $189 = $11;
  $190 = $189 << 1;
  $191 = (($190) + 1)|0;
  $192 = (($188) + ($191<<2)|0);
  $193 = HEAP32[$192>>2]|0;
  $194 = (($187) + ($193))|0;
  $195 = $194 >> 15;
  $8 = $195;
  $196 = $4;
  $197 = $11;
  $198 = $197 << 1;
  $199 = (($198) + 2)|0;
  $200 = (($196) + ($199<<2)|0);
  $201 = HEAP32[$200>>2]|0;
  $202 = $4;
  $203 = $11;
  $204 = $203 << 1;
  $205 = (($204) + 3)|0;
  $206 = (($202) + ($205<<2)|0);
  $207 = HEAP32[$206>>2]|0;
  $208 = (($201) + ($207))|0;
  $209 = $208 >> 15;
  $9 = $209;
  $210 = $8;
  $211 = ($210|0)>(32767);
  if ($211) {
   $8 = 32767;
  }
  $212 = $8;
  $213 = ($212|0)<(-32768);
  if ($213) {
   $8 = -32768;
  }
  $214 = $8;
  $215 = $214&65535;
  $216 = $6;
  $217 = $11;
  $218 = (($216) + ($217<<1)|0);
  HEAP16[$218>>1] = $215;
  $219 = $9;
  $220 = ($219|0)>(32767);
  if ($220) {
   $9 = 32767;
  }
  $221 = $9;
  $222 = ($221|0)<(-32768);
  if ($222) {
   $9 = -32768;
  }
  $223 = $9;
  $224 = $223&65535;
  $225 = $6;
  $226 = $11;
  $227 = (($226) + 1)|0;
  $228 = (($225) + ($227<<1)|0);
  HEAP16[$228>>1] = $224;
  $229 = $11;
  $230 = (($229) + 2)|0;
  $11 = $230;
 }
 STACKTOP = sp;return;
}
function _WebRtcSpl_DownBy2ShortToInt($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $12 = $5;
 $13 = $12 >> 1;
 $5 = $13;
 $11 = 0;
 while(1) {
  $14 = $11;
  $15 = $5;
  $16 = ($14|0)<($15|0);
  $17 = $4;
  if (!($16)) {
   break;
  }
  $18 = $11;
  $19 = $18 << 1;
  $20 = (($17) + ($19<<1)|0);
  $21 = HEAP16[$20>>1]|0;
  $22 = $21 << 16 >> 16;
  $23 = $22 << 15;
  $24 = (($23) + 16384)|0;
  $8 = $24;
  $25 = $8;
  $26 = $7;
  $27 = ((($26)) + 4|0);
  $28 = HEAP32[$27>>2]|0;
  $29 = (($25) - ($28))|0;
  $10 = $29;
  $30 = $10;
  $31 = (($30) + 8192)|0;
  $32 = $31 >> 14;
  $10 = $32;
  $33 = $7;
  $34 = HEAP32[$33>>2]|0;
  $35 = $10;
  $36 = HEAP16[(762)>>1]|0;
  $37 = $36 << 16 >> 16;
  $38 = Math_imul($35, $37)|0;
  $39 = (($34) + ($38))|0;
  $9 = $39;
  $40 = $8;
  $41 = $7;
  HEAP32[$41>>2] = $40;
  $42 = $9;
  $43 = $7;
  $44 = ((($43)) + 8|0);
  $45 = HEAP32[$44>>2]|0;
  $46 = (($42) - ($45))|0;
  $10 = $46;
  $47 = $10;
  $48 = $47 >> 14;
  $10 = $48;
  $49 = $10;
  $50 = ($49|0)<(0);
  if ($50) {
   $51 = $10;
   $52 = (($51) + 1)|0;
   $10 = $52;
  }
  $53 = $7;
  $54 = ((($53)) + 4|0);
  $55 = HEAP32[$54>>2]|0;
  $56 = $10;
  $57 = HEAP16[(764)>>1]|0;
  $58 = $57 << 16 >> 16;
  $59 = Math_imul($56, $58)|0;
  $60 = (($55) + ($59))|0;
  $8 = $60;
  $61 = $9;
  $62 = $7;
  $63 = ((($62)) + 4|0);
  HEAP32[$63>>2] = $61;
  $64 = $8;
  $65 = $7;
  $66 = ((($65)) + 12|0);
  $67 = HEAP32[$66>>2]|0;
  $68 = (($64) - ($67))|0;
  $10 = $68;
  $69 = $10;
  $70 = $69 >> 14;
  $10 = $70;
  $71 = $10;
  $72 = ($71|0)<(0);
  if ($72) {
   $73 = $10;
   $74 = (($73) + 1)|0;
   $10 = $74;
  }
  $75 = $7;
  $76 = ((($75)) + 8|0);
  $77 = HEAP32[$76>>2]|0;
  $78 = $10;
  $79 = HEAP16[(766)>>1]|0;
  $80 = $79 << 16 >> 16;
  $81 = Math_imul($78, $80)|0;
  $82 = (($77) + ($81))|0;
  $83 = $7;
  $84 = ((($83)) + 12|0);
  HEAP32[$84>>2] = $82;
  $85 = $8;
  $86 = $7;
  $87 = ((($86)) + 8|0);
  HEAP32[$87>>2] = $85;
  $88 = $7;
  $89 = ((($88)) + 12|0);
  $90 = HEAP32[$89>>2]|0;
  $91 = $90 >> 1;
  $92 = $6;
  $93 = $11;
  $94 = (($92) + ($93<<2)|0);
  HEAP32[$94>>2] = $91;
  $95 = $11;
  $96 = (($95) + 1)|0;
  $11 = $96;
 }
 $97 = ((($17)) + 2|0);
 $4 = $97;
 $11 = 0;
 while(1) {
  $98 = $11;
  $99 = $5;
  $100 = ($98|0)<($99|0);
  $101 = $4;
  if (!($100)) {
   break;
  }
  $102 = $11;
  $103 = $102 << 1;
  $104 = (($101) + ($103<<1)|0);
  $105 = HEAP16[$104>>1]|0;
  $106 = $105 << 16 >> 16;
  $107 = $106 << 15;
  $108 = (($107) + 16384)|0;
  $8 = $108;
  $109 = $8;
  $110 = $7;
  $111 = ((($110)) + 20|0);
  $112 = HEAP32[$111>>2]|0;
  $113 = (($109) - ($112))|0;
  $10 = $113;
  $114 = $10;
  $115 = (($114) + 8192)|0;
  $116 = $115 >> 14;
  $10 = $116;
  $117 = $7;
  $118 = ((($117)) + 16|0);
  $119 = HEAP32[$118>>2]|0;
  $120 = $10;
  $121 = HEAP16[378]|0;
  $122 = $121 << 16 >> 16;
  $123 = Math_imul($120, $122)|0;
  $124 = (($119) + ($123))|0;
  $9 = $124;
  $125 = $8;
  $126 = $7;
  $127 = ((($126)) + 16|0);
  HEAP32[$127>>2] = $125;
  $128 = $9;
  $129 = $7;
  $130 = ((($129)) + 24|0);
  $131 = HEAP32[$130>>2]|0;
  $132 = (($128) - ($131))|0;
  $10 = $132;
  $133 = $10;
  $134 = $133 >> 14;
  $10 = $134;
  $135 = $10;
  $136 = ($135|0)<(0);
  if ($136) {
   $137 = $10;
   $138 = (($137) + 1)|0;
   $10 = $138;
  }
  $139 = $7;
  $140 = ((($139)) + 20|0);
  $141 = HEAP32[$140>>2]|0;
  $142 = $10;
  $143 = HEAP16[(758)>>1]|0;
  $144 = $143 << 16 >> 16;
  $145 = Math_imul($142, $144)|0;
  $146 = (($141) + ($145))|0;
  $8 = $146;
  $147 = $9;
  $148 = $7;
  $149 = ((($148)) + 20|0);
  HEAP32[$149>>2] = $147;
  $150 = $8;
  $151 = $7;
  $152 = ((($151)) + 28|0);
  $153 = HEAP32[$152>>2]|0;
  $154 = (($150) - ($153))|0;
  $10 = $154;
  $155 = $10;
  $156 = $155 >> 14;
  $10 = $156;
  $157 = $10;
  $158 = ($157|0)<(0);
  if ($158) {
   $159 = $10;
   $160 = (($159) + 1)|0;
   $10 = $160;
  }
  $161 = $7;
  $162 = ((($161)) + 24|0);
  $163 = HEAP32[$162>>2]|0;
  $164 = $10;
  $165 = HEAP16[(760)>>1]|0;
  $166 = $165 << 16 >> 16;
  $167 = Math_imul($164, $166)|0;
  $168 = (($163) + ($167))|0;
  $169 = $7;
  $170 = ((($169)) + 28|0);
  HEAP32[$170>>2] = $168;
  $171 = $8;
  $172 = $7;
  $173 = ((($172)) + 24|0);
  HEAP32[$173>>2] = $171;
  $174 = $7;
  $175 = ((($174)) + 28|0);
  $176 = HEAP32[$175>>2]|0;
  $177 = $176 >> 1;
  $178 = $6;
  $179 = $11;
  $180 = (($178) + ($179<<2)|0);
  $181 = HEAP32[$180>>2]|0;
  $182 = (($181) + ($177))|0;
  HEAP32[$180>>2] = $182;
  $183 = $11;
  $184 = (($183) + 1)|0;
  $11 = $184;
 }
 $185 = ((($101)) + -2|0);
 $4 = $185;
 STACKTOP = sp;return;
}
function _WebRtcSpl_LPBy2IntToInt($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0;
 var $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0;
 var $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0;
 var $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0;
 var $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0;
 var $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0;
 var $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0;
 var $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $12 = $5;
 $13 = $12 >> 1;
 $5 = $13;
 $14 = $4;
 $15 = ((($14)) + 4|0);
 $4 = $15;
 $16 = $7;
 $17 = ((($16)) + 48|0);
 $18 = HEAP32[$17>>2]|0;
 $8 = $18;
 $11 = 0;
 while(1) {
  $19 = $11;
  $20 = $5;
  $21 = ($19|0)<($20|0);
  if (!($21)) {
   break;
  }
  $22 = $8;
  $23 = $7;
  $24 = ((($23)) + 4|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = (($22) - ($25))|0;
  $10 = $26;
  $27 = $10;
  $28 = (($27) + 8192)|0;
  $29 = $28 >> 14;
  $10 = $29;
  $30 = $7;
  $31 = HEAP32[$30>>2]|0;
  $32 = $10;
  $33 = HEAP16[(762)>>1]|0;
  $34 = $33 << 16 >> 16;
  $35 = Math_imul($32, $34)|0;
  $36 = (($31) + ($35))|0;
  $9 = $36;
  $37 = $8;
  $38 = $7;
  HEAP32[$38>>2] = $37;
  $39 = $9;
  $40 = $7;
  $41 = ((($40)) + 8|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = (($39) - ($42))|0;
  $10 = $43;
  $44 = $10;
  $45 = $44 >> 14;
  $10 = $45;
  $46 = $10;
  $47 = ($46|0)<(0);
  if ($47) {
   $48 = $10;
   $49 = (($48) + 1)|0;
   $10 = $49;
  }
  $50 = $7;
  $51 = ((($50)) + 4|0);
  $52 = HEAP32[$51>>2]|0;
  $53 = $10;
  $54 = HEAP16[(764)>>1]|0;
  $55 = $54 << 16 >> 16;
  $56 = Math_imul($53, $55)|0;
  $57 = (($52) + ($56))|0;
  $8 = $57;
  $58 = $9;
  $59 = $7;
  $60 = ((($59)) + 4|0);
  HEAP32[$60>>2] = $58;
  $61 = $8;
  $62 = $7;
  $63 = ((($62)) + 12|0);
  $64 = HEAP32[$63>>2]|0;
  $65 = (($61) - ($64))|0;
  $10 = $65;
  $66 = $10;
  $67 = $66 >> 14;
  $10 = $67;
  $68 = $10;
  $69 = ($68|0)<(0);
  if ($69) {
   $70 = $10;
   $71 = (($70) + 1)|0;
   $10 = $71;
  }
  $72 = $7;
  $73 = ((($72)) + 8|0);
  $74 = HEAP32[$73>>2]|0;
  $75 = $10;
  $76 = HEAP16[(766)>>1]|0;
  $77 = $76 << 16 >> 16;
  $78 = Math_imul($75, $77)|0;
  $79 = (($74) + ($78))|0;
  $80 = $7;
  $81 = ((($80)) + 12|0);
  HEAP32[$81>>2] = $79;
  $82 = $8;
  $83 = $7;
  $84 = ((($83)) + 8|0);
  HEAP32[$84>>2] = $82;
  $85 = $7;
  $86 = ((($85)) + 12|0);
  $87 = HEAP32[$86>>2]|0;
  $88 = $87 >> 1;
  $89 = $6;
  $90 = $11;
  $91 = $90 << 1;
  $92 = (($89) + ($91<<2)|0);
  HEAP32[$92>>2] = $88;
  $93 = $4;
  $94 = $11;
  $95 = $94 << 1;
  $96 = (($93) + ($95<<2)|0);
  $97 = HEAP32[$96>>2]|0;
  $8 = $97;
  $98 = $11;
  $99 = (($98) + 1)|0;
  $11 = $99;
 }
 $100 = $4;
 $101 = ((($100)) + -4|0);
 $4 = $101;
 $11 = 0;
 while(1) {
  $102 = $11;
  $103 = $5;
  $104 = ($102|0)<($103|0);
  if (!($104)) {
   break;
  }
  $105 = $4;
  $106 = $11;
  $107 = $106 << 1;
  $108 = (($105) + ($107<<2)|0);
  $109 = HEAP32[$108>>2]|0;
  $8 = $109;
  $110 = $8;
  $111 = $7;
  $112 = ((($111)) + 20|0);
  $113 = HEAP32[$112>>2]|0;
  $114 = (($110) - ($113))|0;
  $10 = $114;
  $115 = $10;
  $116 = (($115) + 8192)|0;
  $117 = $116 >> 14;
  $10 = $117;
  $118 = $7;
  $119 = ((($118)) + 16|0);
  $120 = HEAP32[$119>>2]|0;
  $121 = $10;
  $122 = HEAP16[378]|0;
  $123 = $122 << 16 >> 16;
  $124 = Math_imul($121, $123)|0;
  $125 = (($120) + ($124))|0;
  $9 = $125;
  $126 = $8;
  $127 = $7;
  $128 = ((($127)) + 16|0);
  HEAP32[$128>>2] = $126;
  $129 = $9;
  $130 = $7;
  $131 = ((($130)) + 24|0);
  $132 = HEAP32[$131>>2]|0;
  $133 = (($129) - ($132))|0;
  $10 = $133;
  $134 = $10;
  $135 = $134 >> 14;
  $10 = $135;
  $136 = $10;
  $137 = ($136|0)<(0);
  if ($137) {
   $138 = $10;
   $139 = (($138) + 1)|0;
   $10 = $139;
  }
  $140 = $7;
  $141 = ((($140)) + 20|0);
  $142 = HEAP32[$141>>2]|0;
  $143 = $10;
  $144 = HEAP16[(758)>>1]|0;
  $145 = $144 << 16 >> 16;
  $146 = Math_imul($143, $145)|0;
  $147 = (($142) + ($146))|0;
  $8 = $147;
  $148 = $9;
  $149 = $7;
  $150 = ((($149)) + 20|0);
  HEAP32[$150>>2] = $148;
  $151 = $8;
  $152 = $7;
  $153 = ((($152)) + 28|0);
  $154 = HEAP32[$153>>2]|0;
  $155 = (($151) - ($154))|0;
  $10 = $155;
  $156 = $10;
  $157 = $156 >> 14;
  $10 = $157;
  $158 = $10;
  $159 = ($158|0)<(0);
  if ($159) {
   $160 = $10;
   $161 = (($160) + 1)|0;
   $10 = $161;
  }
  $162 = $7;
  $163 = ((($162)) + 24|0);
  $164 = HEAP32[$163>>2]|0;
  $165 = $10;
  $166 = HEAP16[(760)>>1]|0;
  $167 = $166 << 16 >> 16;
  $168 = Math_imul($165, $167)|0;
  $169 = (($164) + ($168))|0;
  $170 = $7;
  $171 = ((($170)) + 28|0);
  HEAP32[$171>>2] = $169;
  $172 = $8;
  $173 = $7;
  $174 = ((($173)) + 24|0);
  HEAP32[$174>>2] = $172;
  $175 = $6;
  $176 = $11;
  $177 = $176 << 1;
  $178 = (($175) + ($177<<2)|0);
  $179 = HEAP32[$178>>2]|0;
  $180 = $7;
  $181 = ((($180)) + 28|0);
  $182 = HEAP32[$181>>2]|0;
  $183 = $182 >> 1;
  $184 = (($179) + ($183))|0;
  $185 = $184 >> 15;
  $186 = $6;
  $187 = $11;
  $188 = $187 << 1;
  $189 = (($186) + ($188<<2)|0);
  HEAP32[$189>>2] = $185;
  $190 = $11;
  $191 = (($190) + 1)|0;
  $11 = $191;
 }
 $192 = $6;
 $193 = ((($192)) + 4|0);
 $6 = $193;
 $11 = 0;
 while(1) {
  $194 = $11;
  $195 = $5;
  $196 = ($194|0)<($195|0);
  $197 = $4;
  if (!($196)) {
   break;
  }
  $198 = $11;
  $199 = $198 << 1;
  $200 = (($197) + ($199<<2)|0);
  $201 = HEAP32[$200>>2]|0;
  $8 = $201;
  $202 = $8;
  $203 = $7;
  $204 = ((($203)) + 36|0);
  $205 = HEAP32[$204>>2]|0;
  $206 = (($202) - ($205))|0;
  $10 = $206;
  $207 = $10;
  $208 = (($207) + 8192)|0;
  $209 = $208 >> 14;
  $10 = $209;
  $210 = $7;
  $211 = ((($210)) + 32|0);
  $212 = HEAP32[$211>>2]|0;
  $213 = $10;
  $214 = HEAP16[(762)>>1]|0;
  $215 = $214 << 16 >> 16;
  $216 = Math_imul($213, $215)|0;
  $217 = (($212) + ($216))|0;
  $9 = $217;
  $218 = $8;
  $219 = $7;
  $220 = ((($219)) + 32|0);
  HEAP32[$220>>2] = $218;
  $221 = $9;
  $222 = $7;
  $223 = ((($222)) + 40|0);
  $224 = HEAP32[$223>>2]|0;
  $225 = (($221) - ($224))|0;
  $10 = $225;
  $226 = $10;
  $227 = $226 >> 14;
  $10 = $227;
  $228 = $10;
  $229 = ($228|0)<(0);
  if ($229) {
   $230 = $10;
   $231 = (($230) + 1)|0;
   $10 = $231;
  }
  $232 = $7;
  $233 = ((($232)) + 36|0);
  $234 = HEAP32[$233>>2]|0;
  $235 = $10;
  $236 = HEAP16[(764)>>1]|0;
  $237 = $236 << 16 >> 16;
  $238 = Math_imul($235, $237)|0;
  $239 = (($234) + ($238))|0;
  $8 = $239;
  $240 = $9;
  $241 = $7;
  $242 = ((($241)) + 36|0);
  HEAP32[$242>>2] = $240;
  $243 = $8;
  $244 = $7;
  $245 = ((($244)) + 44|0);
  $246 = HEAP32[$245>>2]|0;
  $247 = (($243) - ($246))|0;
  $10 = $247;
  $248 = $10;
  $249 = $248 >> 14;
  $10 = $249;
  $250 = $10;
  $251 = ($250|0)<(0);
  if ($251) {
   $252 = $10;
   $253 = (($252) + 1)|0;
   $10 = $253;
  }
  $254 = $7;
  $255 = ((($254)) + 40|0);
  $256 = HEAP32[$255>>2]|0;
  $257 = $10;
  $258 = HEAP16[(766)>>1]|0;
  $259 = $258 << 16 >> 16;
  $260 = Math_imul($257, $259)|0;
  $261 = (($256) + ($260))|0;
  $262 = $7;
  $263 = ((($262)) + 44|0);
  HEAP32[$263>>2] = $261;
  $264 = $8;
  $265 = $7;
  $266 = ((($265)) + 40|0);
  HEAP32[$266>>2] = $264;
  $267 = $7;
  $268 = ((($267)) + 44|0);
  $269 = HEAP32[$268>>2]|0;
  $270 = $269 >> 1;
  $271 = $6;
  $272 = $11;
  $273 = $272 << 1;
  $274 = (($271) + ($273<<2)|0);
  HEAP32[$274>>2] = $270;
  $275 = $11;
  $276 = (($275) + 1)|0;
  $11 = $276;
 }
 $277 = ((($197)) + 4|0);
 $4 = $277;
 $11 = 0;
 while(1) {
  $278 = $11;
  $279 = $5;
  $280 = ($278|0)<($279|0);
  if (!($280)) {
   break;
  }
  $281 = $4;
  $282 = $11;
  $283 = $282 << 1;
  $284 = (($281) + ($283<<2)|0);
  $285 = HEAP32[$284>>2]|0;
  $8 = $285;
  $286 = $8;
  $287 = $7;
  $288 = ((($287)) + 52|0);
  $289 = HEAP32[$288>>2]|0;
  $290 = (($286) - ($289))|0;
  $10 = $290;
  $291 = $10;
  $292 = (($291) + 8192)|0;
  $293 = $292 >> 14;
  $10 = $293;
  $294 = $7;
  $295 = ((($294)) + 48|0);
  $296 = HEAP32[$295>>2]|0;
  $297 = $10;
  $298 = HEAP16[378]|0;
  $299 = $298 << 16 >> 16;
  $300 = Math_imul($297, $299)|0;
  $301 = (($296) + ($300))|0;
  $9 = $301;
  $302 = $8;
  $303 = $7;
  $304 = ((($303)) + 48|0);
  HEAP32[$304>>2] = $302;
  $305 = $9;
  $306 = $7;
  $307 = ((($306)) + 56|0);
  $308 = HEAP32[$307>>2]|0;
  $309 = (($305) - ($308))|0;
  $10 = $309;
  $310 = $10;
  $311 = $310 >> 14;
  $10 = $311;
  $312 = $10;
  $313 = ($312|0)<(0);
  if ($313) {
   $314 = $10;
   $315 = (($314) + 1)|0;
   $10 = $315;
  }
  $316 = $7;
  $317 = ((($316)) + 52|0);
  $318 = HEAP32[$317>>2]|0;
  $319 = $10;
  $320 = HEAP16[(758)>>1]|0;
  $321 = $320 << 16 >> 16;
  $322 = Math_imul($319, $321)|0;
  $323 = (($318) + ($322))|0;
  $8 = $323;
  $324 = $9;
  $325 = $7;
  $326 = ((($325)) + 52|0);
  HEAP32[$326>>2] = $324;
  $327 = $8;
  $328 = $7;
  $329 = ((($328)) + 60|0);
  $330 = HEAP32[$329>>2]|0;
  $331 = (($327) - ($330))|0;
  $10 = $331;
  $332 = $10;
  $333 = $332 >> 14;
  $10 = $333;
  $334 = $10;
  $335 = ($334|0)<(0);
  if ($335) {
   $336 = $10;
   $337 = (($336) + 1)|0;
   $10 = $337;
  }
  $338 = $7;
  $339 = ((($338)) + 56|0);
  $340 = HEAP32[$339>>2]|0;
  $341 = $10;
  $342 = HEAP16[(760)>>1]|0;
  $343 = $342 << 16 >> 16;
  $344 = Math_imul($341, $343)|0;
  $345 = (($340) + ($344))|0;
  $346 = $7;
  $347 = ((($346)) + 60|0);
  HEAP32[$347>>2] = $345;
  $348 = $8;
  $349 = $7;
  $350 = ((($349)) + 56|0);
  HEAP32[$350>>2] = $348;
  $351 = $6;
  $352 = $11;
  $353 = $352 << 1;
  $354 = (($351) + ($353<<2)|0);
  $355 = HEAP32[$354>>2]|0;
  $356 = $7;
  $357 = ((($356)) + 60|0);
  $358 = HEAP32[$357>>2]|0;
  $359 = $358 >> 1;
  $360 = (($355) + ($359))|0;
  $361 = $360 >> 15;
  $362 = $6;
  $363 = $11;
  $364 = $363 << 1;
  $365 = (($362) + ($364<<2)|0);
  HEAP32[$365>>2] = $361;
  $366 = $11;
  $367 = (($366) + 1)|0;
  $11 = $367;
 }
 STACKTOP = sp;return;
}
function _WebRtcSpl_ScaleAndAddVectorsWithRoundC($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond3 = 0, $or$cond5 = 0, $or$cond7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $8 = $0;
 $9 = $1;
 $10 = $2;
 $11 = $3;
 $12 = $4;
 $13 = $5;
 $14 = $6;
 $15 = 0;
 $17 = $12;
 $18 = 1 << $17;
 $19 = $18 >> 1;
 $16 = $19;
 $20 = $8;
 $21 = ($20|0)==(0|0);
 $22 = $10;
 $23 = ($22|0)==(0|0);
 $or$cond = $21 | $23;
 $24 = $13;
 $25 = ($24|0)==(0|0);
 $or$cond3 = $or$cond | $25;
 $26 = $14;
 $27 = ($26|0)<=(0);
 $or$cond5 = $or$cond3 | $27;
 $28 = $12;
 $29 = ($28|0)<(0);
 $or$cond7 = $or$cond5 | $29;
 if ($or$cond7) {
  $7 = -1;
  $60 = $7;
  STACKTOP = sp;return ($60|0);
 }
 $15 = 0;
 while(1) {
  $30 = $15;
  $31 = $14;
  $32 = ($30|0)<($31|0);
  if (!($32)) {
   break;
  }
  $33 = $8;
  $34 = $15;
  $35 = (($33) + ($34<<1)|0);
  $36 = HEAP16[$35>>1]|0;
  $37 = $36 << 16 >> 16;
  $38 = $9;
  $39 = $38 << 16 >> 16;
  $40 = Math_imul($37, $39)|0;
  $41 = $10;
  $42 = $15;
  $43 = (($41) + ($42<<1)|0);
  $44 = HEAP16[$43>>1]|0;
  $45 = $44 << 16 >> 16;
  $46 = $11;
  $47 = $46 << 16 >> 16;
  $48 = Math_imul($45, $47)|0;
  $49 = (($40) + ($48))|0;
  $50 = $16;
  $51 = (($49) + ($50))|0;
  $52 = $12;
  $53 = $51 >> $52;
  $54 = $53&65535;
  $55 = $13;
  $56 = $15;
  $57 = (($55) + ($56<<1)|0);
  HEAP16[$57>>1] = $54;
  $58 = $15;
  $59 = (($58) + 1)|0;
  $15 = $59;
 }
 $7 = 0;
 $60 = $7;
 STACKTOP = sp;return ($60|0);
}
function _WebRtcSpl_CreateRealFFTC($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = 0;
 $4 = $2;
 $5 = ($4|0)>(10);
 $6 = $2;
 $7 = ($6|0)<(0);
 $or$cond = $5 | $7;
 do {
  if ($or$cond) {
   $1 = 0;
  } else {
   $8 = (_malloc(4)|0);
   $3 = $8;
   $9 = $3;
   $10 = ($9|0)==(0|0);
   if ($10) {
    $1 = 0;
    break;
   } else {
    $11 = $2;
    $12 = $3;
    HEAP32[$12>>2] = $11;
    $13 = $3;
    $1 = $13;
    break;
   }
  }
 } while(0);
 $14 = $1;
 STACKTOP = sp;return ($14|0);
}
function _WebRtcSpl_FreeRealFFTC($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ($2|0)!=(0|0);
 if ($3) {
  $4 = $1;
  _free($4);
 }
 STACKTOP = sp;return;
}
function _WebRtcSpl_RealForwardFFTC($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(4128|0);
 $10 = sp + 32|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 0;
 $7 = 0;
 $8 = 0;
 $11 = $3;
 $12 = HEAP32[$11>>2]|0;
 $13 = 1 << $12;
 $9 = $13;
 $6 = 0;
 $7 = 0;
 while(1) {
  $14 = $6;
  $15 = $9;
  $16 = ($14|0)<($15|0);
  if (!($16)) {
   break;
  }
  $17 = $4;
  $18 = $6;
  $19 = (($17) + ($18<<1)|0);
  $20 = HEAP16[$19>>1]|0;
  $21 = $7;
  $22 = (($10) + ($21<<1)|0);
  HEAP16[$22>>1] = $20;
  $23 = $7;
  $24 = (($23) + 1)|0;
  $25 = (($10) + ($24<<1)|0);
  HEAP16[$25>>1] = 0;
  $26 = $6;
  $27 = (($26) + 1)|0;
  $6 = $27;
  $28 = $7;
  $29 = (($28) + 2)|0;
  $7 = $29;
 }
 $30 = $3;
 $31 = HEAP32[$30>>2]|0;
 _WebRtcSpl_ComplexBitReverse($10,$31);
 $32 = $3;
 $33 = HEAP32[$32>>2]|0;
 $34 = (_WebRtcSpl_ComplexFFT($10,$33,1)|0);
 $8 = $34;
 $35 = $5;
 $36 = $9;
 $37 = (($36) + 2)|0;
 $38 = $37<<1;
 _memcpy(($35|0),($10|0),($38|0))|0;
 $39 = $8;
 STACKTOP = sp;return ($39|0);
}
function _WebRtcSpl_RealInverseFFTC($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(4128|0);
 $10 = sp + 32|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 0;
 $7 = 0;
 $8 = 0;
 $11 = $3;
 $12 = HEAP32[$11>>2]|0;
 $13 = 1 << $12;
 $9 = $13;
 $14 = $4;
 $15 = $9;
 $16 = (($15) + 2)|0;
 $17 = $16<<1;
 _memcpy(($10|0),($14|0),($17|0))|0;
 $18 = $9;
 $19 = (($18) + 2)|0;
 $6 = $19;
 while(1) {
  $20 = $6;
  $21 = $9;
  $22 = $21<<1;
  $23 = ($20|0)<($22|0);
  if (!($23)) {
   break;
  }
  $24 = $4;
  $25 = $9;
  $26 = $25<<1;
  $27 = $6;
  $28 = (($26) - ($27))|0;
  $29 = (($24) + ($28<<1)|0);
  $30 = HEAP16[$29>>1]|0;
  $31 = $6;
  $32 = (($10) + ($31<<1)|0);
  HEAP16[$32>>1] = $30;
  $33 = $4;
  $34 = $9;
  $35 = $34<<1;
  $36 = $6;
  $37 = (($35) - ($36))|0;
  $38 = (($37) + 1)|0;
  $39 = (($33) + ($38<<1)|0);
  $40 = HEAP16[$39>>1]|0;
  $41 = $40 << 16 >> 16;
  $42 = (0 - ($41))|0;
  $43 = $42&65535;
  $44 = $6;
  $45 = (($44) + 1)|0;
  $46 = (($10) + ($45<<1)|0);
  HEAP16[$46>>1] = $43;
  $47 = $6;
  $48 = (($47) + 2)|0;
  $6 = $48;
 }
 $49 = $3;
 $50 = HEAP32[$49>>2]|0;
 _WebRtcSpl_ComplexBitReverse($10,$50);
 $51 = $3;
 $52 = HEAP32[$51>>2]|0;
 $53 = (_WebRtcSpl_ComplexIFFT($10,$52,1)|0);
 $8 = $53;
 $6 = 0;
 $7 = 0;
 while(1) {
  $54 = $6;
  $55 = $9;
  $56 = ($54|0)<($55|0);
  if (!($56)) {
   break;
  }
  $57 = $7;
  $58 = (($10) + ($57<<1)|0);
  $59 = HEAP16[$58>>1]|0;
  $60 = $5;
  $61 = $6;
  $62 = (($60) + ($61<<1)|0);
  HEAP16[$62>>1] = $59;
  $63 = $6;
  $64 = (($63) + 1)|0;
  $6 = $64;
  $65 = $7;
  $66 = (($65) + 2)|0;
  $7 = $66;
 }
 $67 = $8;
 STACKTOP = sp;return ($67|0);
}
function _WebRtcSpl_GetScalingSquare($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$sink = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $14 = $6;
 $15 = (_WebRtcSpl_GetSizeInBits($14)|0);
 $16 = $15 << 16 >> 16;
 $7 = $16;
 $9 = -1;
 $17 = $4;
 $11 = $17;
 $18 = $5;
 $13 = $18;
 $19 = $13;
 $8 = $19;
 while(1) {
  $20 = $8;
  $21 = ($20|0)>(0);
  if (!($21)) {
   break;
  }
  $22 = $11;
  $23 = HEAP16[$22>>1]|0;
  $24 = $23 << 16 >> 16;
  $25 = ($24|0)>(0);
  $26 = $11;
  $27 = ((($26)) + 2|0);
  $11 = $27;
  $28 = HEAP16[$26>>1]|0;
  $29 = $28 << 16 >> 16;
  $30 = (0 - ($29))|0;
  $31 = $25 ? $29 : $30;
  $32 = $31&65535;
  $10 = $32;
  $33 = $10;
  $34 = $33 << 16 >> 16;
  $35 = $9;
  $36 = $35 << 16 >> 16;
  $37 = ($34|0)>($36|0);
  $38 = $9;
  $39 = $10;
  $$sink = $37 ? $39 : $38;
  $40 = $$sink << 16 >> 16;
  $41 = $40&65535;
  $9 = $41;
  $42 = $8;
  $43 = (($42) + -1)|0;
  $8 = $43;
 }
 $44 = $9;
 $45 = $44 << 16 >> 16;
 $46 = $9;
 $47 = $46 << 16 >> 16;
 $48 = Math_imul($45, $47)|0;
 $49 = (_WebRtcSpl_NormW32_80($48)|0);
 $12 = $49;
 $50 = $9;
 $51 = $50 << 16 >> 16;
 $52 = ($51|0)==(0);
 if ($52) {
  $3 = 0;
  $60 = $3;
  STACKTOP = sp;return ($60|0);
 }
 $53 = $12;
 $54 = $7;
 $55 = ($53|0)>($54|0);
 if ($55) {
  $59 = 0;
 } else {
  $56 = $7;
  $57 = $12;
  $58 = (($56) - ($57))|0;
  $59 = $58;
 }
 $3 = $59;
 $60 = $3;
 STACKTOP = sp;return ($60|0);
}
function _WebRtcSpl_GetSizeInBits($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 $4 = -65536 & $3;
 $5 = ($4|0)!=(0);
 if ($5) {
  $2 = 16;
 } else {
  $2 = 0;
 }
 $6 = $1;
 $7 = $2;
 $8 = $6 >>> $7;
 $9 = 65280 & $8;
 $10 = ($9|0)!=(0);
 if ($10) {
  $11 = $2;
  $12 = (($11) + 8)|0;
  $2 = $12;
 }
 $13 = $1;
 $14 = $2;
 $15 = $13 >>> $14;
 $16 = 240 & $15;
 $17 = ($16|0)!=(0);
 if ($17) {
  $18 = $2;
  $19 = (($18) + 4)|0;
  $2 = $19;
 }
 $20 = $1;
 $21 = $2;
 $22 = $20 >>> $21;
 $23 = 12 & $22;
 $24 = ($23|0)!=(0);
 if ($24) {
  $25 = $2;
  $26 = (($25) + 2)|0;
  $2 = $26;
 }
 $27 = $1;
 $28 = $2;
 $29 = $27 >>> $28;
 $30 = 2 & $29;
 $31 = ($30|0)!=(0);
 if ($31) {
  $32 = $2;
  $33 = (($32) + 1)|0;
  $2 = $33;
 }
 $34 = $1;
 $35 = $2;
 $36 = $34 >>> $35;
 $37 = 1 & $36;
 $38 = ($37|0)!=(0);
 if (!($38)) {
  $41 = $2;
  $42 = $41&65535;
  STACKTOP = sp;return ($42|0);
 }
 $39 = $2;
 $40 = (($39) + 1)|0;
 $2 = $40;
 $41 = $2;
 $42 = $41&65535;
 STACKTOP = sp;return ($42|0);
}
function _WebRtcSpl_NormW32_80($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $2;
 $5 = ($4|0)==(0);
 if ($5) {
  $1 = 0;
  $42 = $1;
  STACKTOP = sp;return ($42|0);
 }
 $6 = $2;
 $7 = ($6|0)<(0);
 if ($7) {
  $8 = $2;
  $9 = $8 ^ -1;
  $2 = $9;
 }
 $10 = $2;
 $11 = -32768 & $10;
 $12 = ($11|0)!=(0);
 if ($12) {
  $3 = 0;
 } else {
  $3 = 16;
 }
 $13 = $2;
 $14 = $3;
 $15 = $13 << $14;
 $16 = -8388608 & $15;
 $17 = ($16|0)!=(0);
 if (!($17)) {
  $18 = $3;
  $19 = (($18) + 8)|0;
  $3 = $19;
 }
 $20 = $2;
 $21 = $3;
 $22 = $20 << $21;
 $23 = -134217728 & $22;
 $24 = ($23|0)!=(0);
 if (!($24)) {
  $25 = $3;
  $26 = (($25) + 4)|0;
  $3 = $26;
 }
 $27 = $2;
 $28 = $3;
 $29 = $27 << $28;
 $30 = -536870912 & $29;
 $31 = ($30|0)!=(0);
 if (!($31)) {
  $32 = $3;
  $33 = (($32) + 2)|0;
  $3 = $33;
 }
 $34 = $2;
 $35 = $3;
 $36 = $34 << $35;
 $37 = -1073741824 & $36;
 $38 = ($37|0)!=(0);
 if (!($38)) {
  $39 = $3;
  $40 = (($39) + 1)|0;
  $3 = $40;
 }
 $41 = $3;
 $1 = $41;
 $42 = $1;
 STACKTOP = sp;return ($42|0);
}
function _WebRtcSpl_DownsampleFastC($0,$1,$2,$3,$4,$5,$6,$7) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $8 = 0;
 var $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $9 = $0;
 $10 = $1;
 $11 = $2;
 $12 = $3;
 $13 = $4;
 $14 = $5;
 $15 = $6;
 $16 = $7;
 $17 = 0;
 $18 = 0;
 $19 = 0;
 $21 = $16;
 $22 = $15;
 $23 = $12;
 $24 = (($23) - 1)|0;
 $25 = Math_imul($22, $24)|0;
 $26 = (($21) + ($25))|0;
 $27 = (($26) + 1)|0;
 $20 = $27;
 $28 = $12;
 $29 = ($28|0)<=(0);
 $30 = $14;
 $31 = ($30|0)<=(0);
 $or$cond = $29 | $31;
 if (!($or$cond)) {
  $32 = $10;
  $33 = $20;
  $34 = ($32|0)<($33|0);
  if (!($34)) {
   $35 = $16;
   $17 = $35;
   while(1) {
    $36 = $17;
    $37 = $20;
    $38 = ($36|0)<($37|0);
    if (!($38)) {
     break;
    }
    $19 = 2048;
    $18 = 0;
    while(1) {
     $39 = $18;
     $40 = $14;
     $41 = ($39|0)<($40|0);
     if (!($41)) {
      break;
     }
     $42 = $13;
     $43 = $18;
     $44 = (($42) + ($43<<1)|0);
     $45 = HEAP16[$44>>1]|0;
     $46 = $45 << 16 >> 16;
     $47 = $9;
     $48 = $17;
     $49 = $18;
     $50 = (($48) - ($49))|0;
     $51 = (($47) + ($50<<1)|0);
     $52 = HEAP16[$51>>1]|0;
     $53 = $52 << 16 >> 16;
     $54 = Math_imul($46, $53)|0;
     $55 = $19;
     $56 = (($55) + ($54))|0;
     $19 = $56;
     $57 = $18;
     $58 = (($57) + 1)|0;
     $18 = $58;
    }
    $59 = $19;
    $60 = $59 >> 12;
    $19 = $60;
    $61 = $19;
    $62 = (_WebRtcSpl_SatW32ToW16_83($61)|0);
    $63 = $11;
    $64 = ((($63)) + 2|0);
    $11 = $64;
    HEAP16[$63>>1] = $62;
    $65 = $15;
    $66 = $17;
    $67 = (($66) + ($65))|0;
    $17 = $67;
   }
   $8 = 0;
   $68 = $8;
   STACKTOP = sp;return ($68|0);
  }
 }
 $8 = -1;
 $68 = $8;
 STACKTOP = sp;return ($68|0);
}
function _WebRtcSpl_SatW32ToW16_83($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 $4 = $3&65535;
 $2 = $4;
 $5 = $1;
 $6 = ($5|0)>(32767);
 if ($6) {
  $2 = 32767;
 } else {
  $7 = $1;
  $8 = ($7|0)<(-32768);
  if ($8) {
   $2 = -32768;
  }
 }
 $9 = $2;
 STACKTOP = sp;return ($9|0);
}
function _WebRtcSpl_ComplexFFT($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0;
 var $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0;
 var $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0;
 var $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $20 = $5;
 $21 = 1 << $20;
 $12 = $21;
 $22 = $12;
 $23 = ($22|0)>(1024);
 if ($23) {
  $3 = -1;
  $294 = $3;
  STACKTOP = sp;return ($294|0);
 }
 $9 = 1;
 $10 = 9;
 $24 = $6;
 $25 = ($24|0)==(0);
 L5: do {
  if ($25) {
   while(1) {
    $26 = $9;
    $27 = $12;
    $28 = ($26|0)<($27|0);
    if (!($28)) {
     break L5;
    }
    $29 = $9;
    $30 = $29 << 1;
    $11 = $30;
    $13 = 0;
    while(1) {
     $31 = $13;
     $32 = $9;
     $33 = ($31|0)<($32|0);
     if (!($33)) {
      break;
     }
     $34 = $13;
     $35 = $10;
     $36 = $34 << $35;
     $8 = $36;
     $37 = $8;
     $38 = (($37) + 256)|0;
     $39 = (768 + ($38<<1)|0);
     $40 = HEAP16[$39>>1]|0;
     $14 = $40;
     $41 = $8;
     $42 = (768 + ($41<<1)|0);
     $43 = HEAP16[$42>>1]|0;
     $44 = $43 << 16 >> 16;
     $45 = (0 - ($44))|0;
     $46 = $45&65535;
     $15 = $46;
     $47 = $13;
     $7 = $47;
     while(1) {
      $48 = $7;
      $49 = $12;
      $50 = ($48|0)<($49|0);
      if (!($50)) {
       break;
      }
      $51 = $7;
      $52 = $9;
      $53 = (($51) + ($52))|0;
      $8 = $53;
      $54 = $14;
      $55 = $54 << 16 >> 16;
      $56 = $4;
      $57 = $8;
      $58 = $57<<1;
      $59 = (($56) + ($58<<1)|0);
      $60 = HEAP16[$59>>1]|0;
      $61 = $60 << 16 >> 16;
      $62 = Math_imul($55, $61)|0;
      $63 = $15;
      $64 = $63 << 16 >> 16;
      $65 = $4;
      $66 = $8;
      $67 = $66<<1;
      $68 = (($67) + 1)|0;
      $69 = (($65) + ($68<<1)|0);
      $70 = HEAP16[$69>>1]|0;
      $71 = $70 << 16 >> 16;
      $72 = Math_imul($64, $71)|0;
      $73 = (($62) - ($72))|0;
      $74 = $73 >> 15;
      $16 = $74;
      $75 = $14;
      $76 = $75 << 16 >> 16;
      $77 = $4;
      $78 = $8;
      $79 = $78<<1;
      $80 = (($79) + 1)|0;
      $81 = (($77) + ($80<<1)|0);
      $82 = HEAP16[$81>>1]|0;
      $83 = $82 << 16 >> 16;
      $84 = Math_imul($76, $83)|0;
      $85 = $15;
      $86 = $85 << 16 >> 16;
      $87 = $4;
      $88 = $8;
      $89 = $88<<1;
      $90 = (($87) + ($89<<1)|0);
      $91 = HEAP16[$90>>1]|0;
      $92 = $91 << 16 >> 16;
      $93 = Math_imul($86, $92)|0;
      $94 = (($84) + ($93))|0;
      $95 = $94 >> 15;
      $17 = $95;
      $96 = $4;
      $97 = $7;
      $98 = $97<<1;
      $99 = (($96) + ($98<<1)|0);
      $100 = HEAP16[$99>>1]|0;
      $101 = $100 << 16 >> 16;
      $18 = $101;
      $102 = $4;
      $103 = $7;
      $104 = $103<<1;
      $105 = (($104) + 1)|0;
      $106 = (($102) + ($105<<1)|0);
      $107 = HEAP16[$106>>1]|0;
      $108 = $107 << 16 >> 16;
      $19 = $108;
      $109 = $18;
      $110 = $16;
      $111 = (($109) - ($110))|0;
      $112 = $111 >> 1;
      $113 = $112&65535;
      $114 = $4;
      $115 = $8;
      $116 = $115<<1;
      $117 = (($114) + ($116<<1)|0);
      HEAP16[$117>>1] = $113;
      $118 = $19;
      $119 = $17;
      $120 = (($118) - ($119))|0;
      $121 = $120 >> 1;
      $122 = $121&65535;
      $123 = $4;
      $124 = $8;
      $125 = $124<<1;
      $126 = (($125) + 1)|0;
      $127 = (($123) + ($126<<1)|0);
      HEAP16[$127>>1] = $122;
      $128 = $18;
      $129 = $16;
      $130 = (($128) + ($129))|0;
      $131 = $130 >> 1;
      $132 = $131&65535;
      $133 = $4;
      $134 = $7;
      $135 = $134<<1;
      $136 = (($133) + ($135<<1)|0);
      HEAP16[$136>>1] = $132;
      $137 = $19;
      $138 = $17;
      $139 = (($137) + ($138))|0;
      $140 = $139 >> 1;
      $141 = $140&65535;
      $142 = $4;
      $143 = $7;
      $144 = $143<<1;
      $145 = (($144) + 1)|0;
      $146 = (($142) + ($145<<1)|0);
      HEAP16[$146>>1] = $141;
      $147 = $11;
      $148 = $7;
      $149 = (($148) + ($147))|0;
      $7 = $149;
     }
     $150 = $13;
     $151 = (($150) + 1)|0;
     $13 = $151;
    }
    $152 = $10;
    $153 = (($152) + -1)|0;
    $10 = $153;
    $154 = $11;
    $9 = $154;
   }
  } else {
   while(1) {
    $155 = $9;
    $156 = $12;
    $157 = ($155|0)<($156|0);
    if (!($157)) {
     break L5;
    }
    $158 = $9;
    $159 = $158 << 1;
    $11 = $159;
    $13 = 0;
    while(1) {
     $160 = $13;
     $161 = $9;
     $162 = ($160|0)<($161|0);
     if (!($162)) {
      break;
     }
     $163 = $13;
     $164 = $10;
     $165 = $163 << $164;
     $8 = $165;
     $166 = $8;
     $167 = (($166) + 256)|0;
     $168 = (768 + ($167<<1)|0);
     $169 = HEAP16[$168>>1]|0;
     $14 = $169;
     $170 = $8;
     $171 = (768 + ($170<<1)|0);
     $172 = HEAP16[$171>>1]|0;
     $173 = $172 << 16 >> 16;
     $174 = (0 - ($173))|0;
     $175 = $174&65535;
     $15 = $175;
     $176 = $13;
     $7 = $176;
     while(1) {
      $177 = $7;
      $178 = $12;
      $179 = ($177|0)<($178|0);
      if (!($179)) {
       break;
      }
      $180 = $7;
      $181 = $9;
      $182 = (($180) + ($181))|0;
      $8 = $182;
      $183 = $14;
      $184 = $183 << 16 >> 16;
      $185 = $4;
      $186 = $8;
      $187 = $186<<1;
      $188 = (($185) + ($187<<1)|0);
      $189 = HEAP16[$188>>1]|0;
      $190 = $189 << 16 >> 16;
      $191 = Math_imul($184, $190)|0;
      $192 = $15;
      $193 = $192 << 16 >> 16;
      $194 = $4;
      $195 = $8;
      $196 = $195<<1;
      $197 = (($196) + 1)|0;
      $198 = (($194) + ($197<<1)|0);
      $199 = HEAP16[$198>>1]|0;
      $200 = $199 << 16 >> 16;
      $201 = Math_imul($193, $200)|0;
      $202 = (($191) - ($201))|0;
      $203 = (($202) + 1)|0;
      $16 = $203;
      $204 = $14;
      $205 = $204 << 16 >> 16;
      $206 = $4;
      $207 = $8;
      $208 = $207<<1;
      $209 = (($208) + 1)|0;
      $210 = (($206) + ($209<<1)|0);
      $211 = HEAP16[$210>>1]|0;
      $212 = $211 << 16 >> 16;
      $213 = Math_imul($205, $212)|0;
      $214 = $15;
      $215 = $214 << 16 >> 16;
      $216 = $4;
      $217 = $8;
      $218 = $217<<1;
      $219 = (($216) + ($218<<1)|0);
      $220 = HEAP16[$219>>1]|0;
      $221 = $220 << 16 >> 16;
      $222 = Math_imul($215, $221)|0;
      $223 = (($213) + ($222))|0;
      $224 = (($223) + 1)|0;
      $17 = $224;
      $225 = $16;
      $226 = $225 >> 1;
      $16 = $226;
      $227 = $17;
      $228 = $227 >> 1;
      $17 = $228;
      $229 = $4;
      $230 = $7;
      $231 = $230<<1;
      $232 = (($229) + ($231<<1)|0);
      $233 = HEAP16[$232>>1]|0;
      $234 = $233 << 16 >> 16;
      $235 = $234 << 14;
      $18 = $235;
      $236 = $4;
      $237 = $7;
      $238 = $237<<1;
      $239 = (($238) + 1)|0;
      $240 = (($236) + ($239<<1)|0);
      $241 = HEAP16[$240>>1]|0;
      $242 = $241 << 16 >> 16;
      $243 = $242 << 14;
      $19 = $243;
      $244 = $18;
      $245 = $16;
      $246 = (($244) - ($245))|0;
      $247 = (($246) + 16384)|0;
      $248 = $247 >> 15;
      $249 = $248&65535;
      $250 = $4;
      $251 = $8;
      $252 = $251<<1;
      $253 = (($250) + ($252<<1)|0);
      HEAP16[$253>>1] = $249;
      $254 = $19;
      $255 = $17;
      $256 = (($254) - ($255))|0;
      $257 = (($256) + 16384)|0;
      $258 = $257 >> 15;
      $259 = $258&65535;
      $260 = $4;
      $261 = $8;
      $262 = $261<<1;
      $263 = (($262) + 1)|0;
      $264 = (($260) + ($263<<1)|0);
      HEAP16[$264>>1] = $259;
      $265 = $18;
      $266 = $16;
      $267 = (($265) + ($266))|0;
      $268 = (($267) + 16384)|0;
      $269 = $268 >> 15;
      $270 = $269&65535;
      $271 = $4;
      $272 = $7;
      $273 = $272<<1;
      $274 = (($271) + ($273<<1)|0);
      HEAP16[$274>>1] = $270;
      $275 = $19;
      $276 = $17;
      $277 = (($275) + ($276))|0;
      $278 = (($277) + 16384)|0;
      $279 = $278 >> 15;
      $280 = $279&65535;
      $281 = $4;
      $282 = $7;
      $283 = $282<<1;
      $284 = (($283) + 1)|0;
      $285 = (($281) + ($284<<1)|0);
      HEAP16[$285>>1] = $280;
      $286 = $11;
      $287 = $7;
      $288 = (($287) + ($286))|0;
      $7 = $288;
     }
     $289 = $13;
     $290 = (($289) + 1)|0;
     $13 = $290;
    }
    $291 = $10;
    $292 = (($291) + -1)|0;
    $10 = $292;
    $293 = $11;
    $9 = $293;
   }
  }
 } while(0);
 $3 = 0;
 $294 = $3;
 STACKTOP = sp;return ($294|0);
}
function _WebRtcSpl_ComplexIFFT($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0;
 var $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0;
 var $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0;
 var $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0;
 var $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0;
 var $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $24 = $5;
 $25 = 1 << $24;
 $12 = $25;
 $26 = $12;
 $27 = ($26|0)>(1024);
 if ($27) {
  $3 = -1;
  $327 = $3;
  STACKTOP = sp;return ($327|0);
 }
 $14 = 0;
 $9 = 1;
 $10 = 9;
 while(1) {
  $28 = $9;
  $29 = $12;
  $30 = ($28|0)<($29|0);
  if (!($30)) {
   break;
  }
  $15 = 0;
  $23 = 8192;
  $31 = HEAP32[1571]|0;
  $32 = $4;
  $33 = $12;
  $34 = $33<<1;
  $35 = (FUNCTION_TABLE_iii[$31 & 15]($32,$34)|0);
  $36 = $35 << 16 >> 16;
  $22 = $36;
  $37 = $22;
  $38 = ($37|0)>(13573);
  if ($38) {
   $39 = $15;
   $40 = (($39) + 1)|0;
   $15 = $40;
   $41 = $14;
   $42 = (($41) + 1)|0;
   $14 = $42;
   $43 = $23;
   $44 = $43 << 1;
   $23 = $44;
  }
  $45 = $22;
  $46 = ($45|0)>(27146);
  if ($46) {
   $47 = $15;
   $48 = (($47) + 1)|0;
   $15 = $48;
   $49 = $14;
   $50 = (($49) + 1)|0;
   $14 = $50;
   $51 = $23;
   $52 = $51 << 1;
   $23 = $52;
  }
  $53 = $9;
  $54 = $53 << 1;
  $11 = $54;
  $55 = $6;
  $56 = ($55|0)==(0);
  $13 = 0;
  L14: do {
   if ($56) {
    while(1) {
     $57 = $13;
     $58 = $9;
     $59 = ($57|0)<($58|0);
     if (!($59)) {
      break L14;
     }
     $60 = $13;
     $61 = $10;
     $62 = $60 << $61;
     $8 = $62;
     $63 = $8;
     $64 = (($63) + 256)|0;
     $65 = (768 + ($64<<1)|0);
     $66 = HEAP16[$65>>1]|0;
     $16 = $66;
     $67 = $8;
     $68 = (768 + ($67<<1)|0);
     $69 = HEAP16[$68>>1]|0;
     $17 = $69;
     $70 = $13;
     $7 = $70;
     while(1) {
      $71 = $7;
      $72 = $12;
      $73 = ($71|0)<($72|0);
      if (!($73)) {
       break;
      }
      $74 = $7;
      $75 = $9;
      $76 = (($74) + ($75))|0;
      $8 = $76;
      $77 = $16;
      $78 = $77 << 16 >> 16;
      $79 = $4;
      $80 = $8;
      $81 = $80<<1;
      $82 = (($79) + ($81<<1)|0);
      $83 = HEAP16[$82>>1]|0;
      $84 = $83 << 16 >> 16;
      $85 = Math_imul($78, $84)|0;
      $86 = $85 >> 0;
      $87 = $17;
      $88 = $87 << 16 >> 16;
      $89 = $4;
      $90 = $8;
      $91 = $90<<1;
      $92 = (($91) + 1)|0;
      $93 = (($89) + ($92<<1)|0);
      $94 = HEAP16[$93>>1]|0;
      $95 = $94 << 16 >> 16;
      $96 = Math_imul($88, $95)|0;
      $97 = $96 >> 0;
      $98 = (($86) - ($97))|0;
      $99 = $98 >> 15;
      $18 = $99;
      $100 = $16;
      $101 = $100 << 16 >> 16;
      $102 = $4;
      $103 = $8;
      $104 = $103<<1;
      $105 = (($104) + 1)|0;
      $106 = (($102) + ($105<<1)|0);
      $107 = HEAP16[$106>>1]|0;
      $108 = $107 << 16 >> 16;
      $109 = Math_imul($101, $108)|0;
      $110 = $109 >> 0;
      $111 = $17;
      $112 = $111 << 16 >> 16;
      $113 = $4;
      $114 = $8;
      $115 = $114<<1;
      $116 = (($113) + ($115<<1)|0);
      $117 = HEAP16[$116>>1]|0;
      $118 = $117 << 16 >> 16;
      $119 = Math_imul($112, $118)|0;
      $120 = $119 >> 0;
      $121 = (($110) + ($120))|0;
      $122 = $121 >> 15;
      $19 = $122;
      $123 = $4;
      $124 = $7;
      $125 = $124<<1;
      $126 = (($123) + ($125<<1)|0);
      $127 = HEAP16[$126>>1]|0;
      $128 = $127 << 16 >> 16;
      $20 = $128;
      $129 = $4;
      $130 = $7;
      $131 = $130<<1;
      $132 = (($131) + 1)|0;
      $133 = (($129) + ($132<<1)|0);
      $134 = HEAP16[$133>>1]|0;
      $135 = $134 << 16 >> 16;
      $21 = $135;
      $136 = $20;
      $137 = $18;
      $138 = (($136) - ($137))|0;
      $139 = $15;
      $140 = $138 >> $139;
      $141 = $140&65535;
      $142 = $4;
      $143 = $8;
      $144 = $143<<1;
      $145 = (($142) + ($144<<1)|0);
      HEAP16[$145>>1] = $141;
      $146 = $21;
      $147 = $19;
      $148 = (($146) - ($147))|0;
      $149 = $15;
      $150 = $148 >> $149;
      $151 = $150&65535;
      $152 = $4;
      $153 = $8;
      $154 = $153<<1;
      $155 = (($154) + 1)|0;
      $156 = (($152) + ($155<<1)|0);
      HEAP16[$156>>1] = $151;
      $157 = $20;
      $158 = $18;
      $159 = (($157) + ($158))|0;
      $160 = $15;
      $161 = $159 >> $160;
      $162 = $161&65535;
      $163 = $4;
      $164 = $7;
      $165 = $164<<1;
      $166 = (($163) + ($165<<1)|0);
      HEAP16[$166>>1] = $162;
      $167 = $21;
      $168 = $19;
      $169 = (($167) + ($168))|0;
      $170 = $15;
      $171 = $169 >> $170;
      $172 = $171&65535;
      $173 = $4;
      $174 = $7;
      $175 = $174<<1;
      $176 = (($175) + 1)|0;
      $177 = (($173) + ($176<<1)|0);
      HEAP16[$177>>1] = $172;
      $178 = $11;
      $179 = $7;
      $180 = (($179) + ($178))|0;
      $7 = $180;
     }
     $181 = $13;
     $182 = (($181) + 1)|0;
     $13 = $182;
    }
   } else {
    while(1) {
     $183 = $13;
     $184 = $9;
     $185 = ($183|0)<($184|0);
     if (!($185)) {
      break L14;
     }
     $186 = $13;
     $187 = $10;
     $188 = $186 << $187;
     $8 = $188;
     $189 = $8;
     $190 = (($189) + 256)|0;
     $191 = (768 + ($190<<1)|0);
     $192 = HEAP16[$191>>1]|0;
     $16 = $192;
     $193 = $8;
     $194 = (768 + ($193<<1)|0);
     $195 = HEAP16[$194>>1]|0;
     $17 = $195;
     $196 = $13;
     $7 = $196;
     while(1) {
      $197 = $7;
      $198 = $12;
      $199 = ($197|0)<($198|0);
      if (!($199)) {
       break;
      }
      $200 = $7;
      $201 = $9;
      $202 = (($200) + ($201))|0;
      $8 = $202;
      $203 = $16;
      $204 = $203 << 16 >> 16;
      $205 = $4;
      $206 = $8;
      $207 = $206<<1;
      $208 = (($205) + ($207<<1)|0);
      $209 = HEAP16[$208>>1]|0;
      $210 = $209 << 16 >> 16;
      $211 = Math_imul($204, $210)|0;
      $212 = $17;
      $213 = $212 << 16 >> 16;
      $214 = $4;
      $215 = $8;
      $216 = $215<<1;
      $217 = (($216) + 1)|0;
      $218 = (($214) + ($217<<1)|0);
      $219 = HEAP16[$218>>1]|0;
      $220 = $219 << 16 >> 16;
      $221 = Math_imul($213, $220)|0;
      $222 = (($211) - ($221))|0;
      $223 = (($222) + 1)|0;
      $18 = $223;
      $224 = $16;
      $225 = $224 << 16 >> 16;
      $226 = $4;
      $227 = $8;
      $228 = $227<<1;
      $229 = (($228) + 1)|0;
      $230 = (($226) + ($229<<1)|0);
      $231 = HEAP16[$230>>1]|0;
      $232 = $231 << 16 >> 16;
      $233 = Math_imul($225, $232)|0;
      $234 = $17;
      $235 = $234 << 16 >> 16;
      $236 = $4;
      $237 = $8;
      $238 = $237<<1;
      $239 = (($236) + ($238<<1)|0);
      $240 = HEAP16[$239>>1]|0;
      $241 = $240 << 16 >> 16;
      $242 = Math_imul($235, $241)|0;
      $243 = (($233) + ($242))|0;
      $244 = (($243) + 1)|0;
      $19 = $244;
      $245 = $18;
      $246 = $245 >> 1;
      $18 = $246;
      $247 = $19;
      $248 = $247 >> 1;
      $19 = $248;
      $249 = $4;
      $250 = $7;
      $251 = $250<<1;
      $252 = (($249) + ($251<<1)|0);
      $253 = HEAP16[$252>>1]|0;
      $254 = $253 << 16 >> 16;
      $255 = $254 << 14;
      $20 = $255;
      $256 = $4;
      $257 = $7;
      $258 = $257<<1;
      $259 = (($258) + 1)|0;
      $260 = (($256) + ($259<<1)|0);
      $261 = HEAP16[$260>>1]|0;
      $262 = $261 << 16 >> 16;
      $263 = $262 << 14;
      $21 = $263;
      $264 = $20;
      $265 = $18;
      $266 = (($264) - ($265))|0;
      $267 = $23;
      $268 = (($266) + ($267))|0;
      $269 = $15;
      $270 = (($269) + 14)|0;
      $271 = $268 >> $270;
      $272 = $271&65535;
      $273 = $4;
      $274 = $8;
      $275 = $274<<1;
      $276 = (($273) + ($275<<1)|0);
      HEAP16[$276>>1] = $272;
      $277 = $21;
      $278 = $19;
      $279 = (($277) - ($278))|0;
      $280 = $23;
      $281 = (($279) + ($280))|0;
      $282 = $15;
      $283 = (($282) + 14)|0;
      $284 = $281 >> $283;
      $285 = $284&65535;
      $286 = $4;
      $287 = $8;
      $288 = $287<<1;
      $289 = (($288) + 1)|0;
      $290 = (($286) + ($289<<1)|0);
      HEAP16[$290>>1] = $285;
      $291 = $20;
      $292 = $18;
      $293 = (($291) + ($292))|0;
      $294 = $23;
      $295 = (($293) + ($294))|0;
      $296 = $15;
      $297 = (($296) + 14)|0;
      $298 = $295 >> $297;
      $299 = $298&65535;
      $300 = $4;
      $301 = $7;
      $302 = $301<<1;
      $303 = (($300) + ($302<<1)|0);
      HEAP16[$303>>1] = $299;
      $304 = $21;
      $305 = $19;
      $306 = (($304) + ($305))|0;
      $307 = $23;
      $308 = (($306) + ($307))|0;
      $309 = $15;
      $310 = (($309) + 14)|0;
      $311 = $308 >> $310;
      $312 = $311&65535;
      $313 = $4;
      $314 = $7;
      $315 = $314<<1;
      $316 = (($315) + 1)|0;
      $317 = (($313) + ($316<<1)|0);
      HEAP16[$317>>1] = $312;
      $318 = $11;
      $319 = $7;
      $320 = (($319) + ($318))|0;
      $7 = $320;
     }
     $321 = $13;
     $322 = (($321) + 1)|0;
     $13 = $322;
    }
   }
  } while(0);
  $323 = $10;
  $324 = (($323) + -1)|0;
  $10 = $324;
  $325 = $11;
  $9 = $325;
 }
 $326 = $14;
 $3 = $326;
 $327 = $3;
 STACKTOP = sp;return ($327|0);
}
function _WebRtcSpl_CrossCorrelationC($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = $0;
 $8 = $1;
 $9 = $2;
 $10 = $3;
 $11 = $4;
 $12 = $5;
 $13 = $6;
 $14 = 0;
 $15 = 0;
 $14 = 0;
 while(1) {
  $16 = $14;
  $17 = $11;
  $18 = $17 << 16 >> 16;
  $19 = ($16|0)<($18|0);
  if (!($19)) {
   break;
  }
  $20 = $7;
  HEAP32[$20>>2] = 0;
  $15 = 0;
  while(1) {
   $21 = $15;
   $22 = $10;
   $23 = $22 << 16 >> 16;
   $24 = ($21|0)<($23|0);
   if (!($24)) {
    break;
   }
   $25 = $8;
   $26 = $15;
   $27 = (($25) + ($26<<1)|0);
   $28 = HEAP16[$27>>1]|0;
   $29 = $28 << 16 >> 16;
   $30 = $9;
   $31 = $13;
   $32 = $31 << 16 >> 16;
   $33 = $14;
   $34 = Math_imul($32, $33)|0;
   $35 = $15;
   $36 = (($34) + ($35))|0;
   $37 = (($30) + ($36<<1)|0);
   $38 = HEAP16[$37>>1]|0;
   $39 = $38 << 16 >> 16;
   $40 = Math_imul($29, $39)|0;
   $41 = $12;
   $42 = $41 << 16 >> 16;
   $43 = $40 >> $42;
   $44 = $7;
   $45 = HEAP32[$44>>2]|0;
   $46 = (($45) + ($43))|0;
   HEAP32[$44>>2] = $46;
   $47 = $15;
   $48 = (($47) + 1)|0;
   $15 = $48;
  }
  $49 = $7;
  $50 = ((($49)) + 4|0);
  $7 = $50;
  $51 = $14;
  $52 = (($51) + 1)|0;
  $14 = $52;
 }
 STACKTOP = sp;return;
}
function _WebRtcSpl_ComplexBitReverse($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $2 = $0;
 $3 = $1;
 $16 = $3;
 $17 = ($16|0)==(7);
 $18 = $3;
 $19 = ($18|0)==(8);
 $or$cond = $17 | $19;
 if ($or$cond) {
  $4 = 0;
  $5 = 112;
  $6 = 2816;
  $20 = $3;
  $21 = ($20|0)==(8);
  if ($21) {
   $5 = 240;
   $6 = 3040;
  }
  $4 = 0;
  while(1) {
   $22 = $4;
   $23 = $5;
   $24 = ($22|0)<($23|0);
   if (!($24)) {
    break;
   }
   $25 = $2;
   $7 = $25;
   $8 = 0;
   $26 = $7;
   $27 = $6;
   $28 = $4;
   $29 = (($27) + ($28<<1)|0);
   $30 = HEAP16[$29>>1]|0;
   $31 = $30 << 16 >> 16;
   $32 = (($26) + ($31<<2)|0);
   $33 = HEAP32[$32>>2]|0;
   $8 = $33;
   $34 = $7;
   $35 = $6;
   $36 = $4;
   $37 = (($36) + 1)|0;
   $38 = (($35) + ($37<<1)|0);
   $39 = HEAP16[$38>>1]|0;
   $40 = $39 << 16 >> 16;
   $41 = (($34) + ($40<<2)|0);
   $42 = HEAP32[$41>>2]|0;
   $43 = $7;
   $44 = $6;
   $45 = $4;
   $46 = (($44) + ($45<<1)|0);
   $47 = HEAP16[$46>>1]|0;
   $48 = $47 << 16 >> 16;
   $49 = (($43) + ($48<<2)|0);
   HEAP32[$49>>2] = $42;
   $50 = $8;
   $51 = $7;
   $52 = $6;
   $53 = $4;
   $54 = (($53) + 1)|0;
   $55 = (($52) + ($54<<1)|0);
   $56 = HEAP16[$55>>1]|0;
   $57 = $56 << 16 >> 16;
   $58 = (($51) + ($57<<2)|0);
   HEAP32[$58>>2] = $50;
   $59 = $4;
   $60 = (($59) + 2)|0;
   $4 = $60;
  }
  STACKTOP = sp;return;
 }
 $9 = 0;
 $10 = 0;
 $11 = 0;
 $61 = $3;
 $62 = 1 << $61;
 $12 = $62;
 $63 = $12;
 $64 = (($63) - 1)|0;
 $13 = $64;
 $9 = 1;
 while(1) {
  $65 = $9;
  $66 = $13;
  $67 = ($65|0)<=($66|0);
  if (!($67)) {
   break;
  }
  $68 = $2;
  $14 = $68;
  $15 = 0;
  $69 = $12;
  $11 = $69;
  while(1) {
   $70 = $11;
   $71 = $70 >> 1;
   $11 = $71;
   $72 = $11;
   $73 = $13;
   $74 = $10;
   $75 = (($73) - ($74))|0;
   $76 = ($72|0)>($75|0);
   if (!($76)) {
    break;
   }
  }
  $77 = $10;
  $78 = $11;
  $79 = (($78) - 1)|0;
  $80 = $77 & $79;
  $81 = $11;
  $82 = (($80) + ($81))|0;
  $10 = $82;
  $83 = $10;
  $84 = $9;
  $85 = ($83|0)<=($84|0);
  if (!($85)) {
   $86 = $14;
   $87 = $9;
   $88 = (($86) + ($87<<2)|0);
   $89 = HEAP32[$88>>2]|0;
   $15 = $89;
   $90 = $14;
   $91 = $10;
   $92 = (($90) + ($91<<2)|0);
   $93 = HEAP32[$92>>2]|0;
   $94 = $14;
   $95 = $9;
   $96 = (($94) + ($95<<2)|0);
   HEAP32[$96>>2] = $93;
   $97 = $15;
   $98 = $14;
   $99 = $10;
   $100 = (($98) + ($99<<2)|0);
   HEAP32[$100>>2] = $97;
  }
  $101 = $9;
  $102 = (($101) + 1)|0;
  $9 = $102;
 }
 STACKTOP = sp;return;
}
function _WebRtcSpl_MaxAbsValueW16C($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = 0;
 $6 = 0;
 $7 = 0;
 $8 = $3;
 $9 = ($8|0)==(0|0);
 $10 = $4;
 $11 = ($10|0)<=(0);
 $or$cond = $9 | $11;
 if ($or$cond) {
  $2 = -1;
  $31 = $2;
  STACKTOP = sp;return ($31|0);
 }
 $5 = 0;
 while(1) {
  $12 = $5;
  $13 = $4;
  $14 = ($12|0)<($13|0);
  if (!($14)) {
   break;
  }
  $15 = $3;
  $16 = $5;
  $17 = (($15) + ($16<<1)|0);
  $18 = HEAP16[$17>>1]|0;
  $19 = $18 << 16 >> 16;
  $20 = (Math_abs(($19|0))|0);
  $6 = $20;
  $21 = $6;
  $22 = $7;
  $23 = ($21|0)>($22|0);
  if ($23) {
   $24 = $6;
   $7 = $24;
  }
  $25 = $5;
  $26 = (($25) + 1)|0;
  $5 = $26;
 }
 $27 = $7;
 $28 = ($27|0)>(32767);
 if ($28) {
  $7 = 32767;
 }
 $29 = $7;
 $30 = $29&65535;
 $2 = $30;
 $31 = $2;
 STACKTOP = sp;return ($31|0);
}
function _WebRtcSpl_MaxAbsValueW32C($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = 0;
 $6 = 0;
 $7 = 0;
 $8 = $3;
 $9 = ($8|0)==(0|0);
 $10 = $4;
 $11 = ($10|0)<=(0);
 $or$cond = $9 | $11;
 if ($or$cond) {
  $2 = -1;
  $31 = $2;
  STACKTOP = sp;return ($31|0);
 }
 $7 = 0;
 while(1) {
  $12 = $7;
  $13 = $4;
  $14 = ($12|0)<($13|0);
  if (!($14)) {
   break;
  }
  $15 = $3;
  $16 = $7;
  $17 = (($15) + ($16<<2)|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (Math_abs(($18|0))|0);
  $5 = $19;
  $20 = $5;
  $21 = $6;
  $22 = ($20>>>0)>($21>>>0);
  if ($22) {
   $23 = $5;
   $6 = $23;
  }
  $24 = $7;
  $25 = (($24) + 1)|0;
  $7 = $25;
 }
 $26 = $6;
 $27 = ($26>>>0)<(2147483647);
 $28 = $6;
 $29 = $27 ? $28 : 2147483647;
 $6 = $29;
 $30 = $6;
 $2 = $30;
 $31 = $2;
 STACKTOP = sp;return ($31|0);
}
function _WebRtcSpl_MaxValueW16C($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = -32768;
 $6 = 0;
 $7 = $3;
 $8 = ($7|0)==(0|0);
 $9 = $4;
 $10 = ($9|0)<=(0);
 $or$cond = $8 | $10;
 if ($or$cond) {
  $11 = $5;
  $2 = $11;
  $30 = $2;
  STACKTOP = sp;return ($30|0);
 }
 $6 = 0;
 while(1) {
  $12 = $6;
  $13 = $4;
  $14 = ($12|0)<($13|0);
  if (!($14)) {
   break;
  }
  $15 = $3;
  $16 = $6;
  $17 = (($15) + ($16<<1)|0);
  $18 = HEAP16[$17>>1]|0;
  $19 = $18 << 16 >> 16;
  $20 = $5;
  $21 = $20 << 16 >> 16;
  $22 = ($19|0)>($21|0);
  if ($22) {
   $23 = $3;
   $24 = $6;
   $25 = (($23) + ($24<<1)|0);
   $26 = HEAP16[$25>>1]|0;
   $5 = $26;
  }
  $27 = $6;
  $28 = (($27) + 1)|0;
  $6 = $28;
 }
 $29 = $5;
 $2 = $29;
 $30 = $2;
 STACKTOP = sp;return ($30|0);
}
function _WebRtcSpl_MaxValueW32C($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = -2147483648;
 $6 = 0;
 $7 = $3;
 $8 = ($7|0)==(0|0);
 $9 = $4;
 $10 = ($9|0)<=(0);
 $or$cond = $8 | $10;
 if ($or$cond) {
  $11 = $5;
  $2 = $11;
  $28 = $2;
  STACKTOP = sp;return ($28|0);
 }
 $6 = 0;
 while(1) {
  $12 = $6;
  $13 = $4;
  $14 = ($12|0)<($13|0);
  if (!($14)) {
   break;
  }
  $15 = $3;
  $16 = $6;
  $17 = (($15) + ($16<<2)|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = $5;
  $20 = ($18|0)>($19|0);
  if ($20) {
   $21 = $3;
   $22 = $6;
   $23 = (($21) + ($22<<2)|0);
   $24 = HEAP32[$23>>2]|0;
   $5 = $24;
  }
  $25 = $6;
  $26 = (($25) + 1)|0;
  $6 = $26;
 }
 $27 = $5;
 $2 = $27;
 $28 = $2;
 STACKTOP = sp;return ($28|0);
}
function _WebRtcSpl_MinValueW16C($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = 32767;
 $6 = 0;
 $7 = $3;
 $8 = ($7|0)==(0|0);
 $9 = $4;
 $10 = ($9|0)<=(0);
 $or$cond = $8 | $10;
 if ($or$cond) {
  $11 = $5;
  $2 = $11;
  $30 = $2;
  STACKTOP = sp;return ($30|0);
 }
 $6 = 0;
 while(1) {
  $12 = $6;
  $13 = $4;
  $14 = ($12|0)<($13|0);
  if (!($14)) {
   break;
  }
  $15 = $3;
  $16 = $6;
  $17 = (($15) + ($16<<1)|0);
  $18 = HEAP16[$17>>1]|0;
  $19 = $18 << 16 >> 16;
  $20 = $5;
  $21 = $20 << 16 >> 16;
  $22 = ($19|0)<($21|0);
  if ($22) {
   $23 = $3;
   $24 = $6;
   $25 = (($23) + ($24<<1)|0);
   $26 = HEAP16[$25>>1]|0;
   $5 = $26;
  }
  $27 = $6;
  $28 = (($27) + 1)|0;
  $6 = $28;
 }
 $29 = $5;
 $2 = $29;
 $30 = $2;
 STACKTOP = sp;return ($30|0);
}
function _WebRtcSpl_MinValueW32C($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = 2147483647;
 $6 = 0;
 $7 = $3;
 $8 = ($7|0)==(0|0);
 $9 = $4;
 $10 = ($9|0)<=(0);
 $or$cond = $8 | $10;
 if ($or$cond) {
  $11 = $5;
  $2 = $11;
  $28 = $2;
  STACKTOP = sp;return ($28|0);
 }
 $6 = 0;
 while(1) {
  $12 = $6;
  $13 = $4;
  $14 = ($12|0)<($13|0);
  if (!($14)) {
   break;
  }
  $15 = $3;
  $16 = $6;
  $17 = (($15) + ($16<<2)|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = $5;
  $20 = ($18|0)<($19|0);
  if ($20) {
   $21 = $3;
   $22 = $6;
   $23 = (($21) + ($22<<2)|0);
   $24 = HEAP32[$23>>2]|0;
   $5 = $24;
  }
  $25 = $6;
  $26 = (($25) + 1)|0;
  $6 = $26;
 }
 $27 = $5;
 $2 = $27;
 $28 = $2;
 STACKTOP = sp;return ($28|0);
}
function _emscripten_get_global_libc() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6340|0);
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (_dummy_570($2)|0);
 HEAP32[$vararg_buffer>>2] = $3;
 $4 = (___syscall6(6,($vararg_buffer|0))|0);
 $5 = (___syscall_ret($4)|0);
 STACKTOP = sp;return ($5|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0;
 var $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $3;
 HEAP32[$vararg_buffer>>2] = $14;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $15;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $16 = (___syscall146(146,($vararg_buffer|0))|0);
 $17 = (___syscall_ret($16)|0);
 $18 = ($12|0)==($17|0);
 L1: do {
  if ($18) {
   label = 3;
  } else {
   $$04756 = 2;$$04855 = $12;$$04954 = $3;$26 = $17;
   while(1) {
    $25 = ($26|0)<(0);
    if ($25) {
     break;
    }
    $34 = (($$04855) - ($26))|0;
    $35 = ((($$04954)) + 4|0);
    $36 = HEAP32[$35>>2]|0;
    $37 = ($26>>>0)>($36>>>0);
    $38 = ((($$04954)) + 8|0);
    $$150 = $37 ? $38 : $$04954;
    $39 = $37 << 31 >> 31;
    $$1 = (($39) + ($$04756))|0;
    $40 = $37 ? $36 : 0;
    $$0 = (($26) - ($40))|0;
    $41 = HEAP32[$$150>>2]|0;
    $42 = (($41) + ($$0)|0);
    HEAP32[$$150>>2] = $42;
    $43 = ((($$150)) + 4|0);
    $44 = HEAP32[$43>>2]|0;
    $45 = (($44) - ($$0))|0;
    HEAP32[$43>>2] = $45;
    $46 = HEAP32[$13>>2]|0;
    $47 = $$150;
    HEAP32[$vararg_buffer3>>2] = $46;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $47;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $$1;
    $48 = (___syscall146(146,($vararg_buffer3|0))|0);
    $49 = (___syscall_ret($48)|0);
    $50 = ($34|0)==($49|0);
    if ($50) {
     label = 3;
     break L1;
    } else {
     $$04756 = $$1;$$04855 = $34;$$04954 = $$150;$26 = $49;
    }
   }
   $27 = ((($0)) + 16|0);
   HEAP32[$27>>2] = 0;
   HEAP32[$4>>2] = 0;
   HEAP32[$7>>2] = 0;
   $28 = HEAP32[$0>>2]|0;
   $29 = $28 | 32;
   HEAP32[$0>>2] = $29;
   $30 = ($$04756|0)==(2);
   if ($30) {
    $$051 = 0;
   } else {
    $31 = ((($$04954)) + 4|0);
    $32 = HEAP32[$31>>2]|0;
    $33 = (($2) - ($32))|0;
    $$051 = $33;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $19 = ((($0)) + 44|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ((($0)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($0)) + 16|0);
  HEAP32[$24>>2] = $23;
  HEAP32[$4>>2] = $20;
  HEAP32[$7>>2] = $20;
  $$051 = $2;
 }
 STACKTOP = sp;return ($$051|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $6;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $7 = (___syscall140(140,($vararg_buffer|0))|0);
 $8 = (___syscall_ret($7)|0);
 $9 = ($8|0)<(0);
 if ($9) {
  HEAP32[$3>>2] = -1;
  $10 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $10 = $$pre;
 }
 STACKTOP = sp;return ($10|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (___pthread_self_103()|0);
 $1 = ((($0)) + 64|0);
 return ($1|0);
}
function ___pthread_self_103() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (24|0);
}
function _dummy_570($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($0|0);
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 16|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 18;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $3;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $10;
  $11 = (___syscall54(54,($vararg_buffer|0))|0);
  $12 = ($11|0)==(0);
  if (!($12)) {
   $13 = ((($0)) + 75|0);
   HEAP8[$13>>0] = -1;
  }
 }
 $14 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($14|0);
}
function _strcmp($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$0>>0]|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = ($2<<24>>24)!=($3<<24>>24);
 $5 = ($2<<24>>24)==(0);
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;$$lcssa8 = $2;
 } else {
  $$011 = $1;$$0710 = $0;
  while(1) {
   $6 = ((($$0710)) + 1|0);
   $7 = ((($$011)) + 1|0);
   $8 = HEAP8[$6>>0]|0;
   $9 = HEAP8[$7>>0]|0;
   $10 = ($8<<24>>24)!=($9<<24>>24);
   $11 = ($8<<24>>24)==(0);
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;$$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;$$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8&255;
 $13 = $$lcssa&255;
 $14 = (($12) - ($13))|0;
 return ($14|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$0 = 0, $$1 = 0, $$1$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $40 = $12;
  } else {
   $40 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  if ($21) {
   $23 = ((($0)) + 44|0);
   $24 = HEAP32[$23>>2]|0;
   HEAP32[$23>>2] = $6;
   $25 = ((($0)) + 28|0);
   HEAP32[$25>>2] = $6;
   $26 = ((($0)) + 20|0);
   HEAP32[$26>>2] = $6;
   HEAP32[$19>>2] = 80;
   $27 = ((($6)) + 80|0);
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = $27;
   $29 = (_printf_core($0,$1,$3,$5,$4)|0);
   $30 = ($24|0)==(0|0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = ((($0)) + 36|0);
    $32 = HEAP32[$31>>2]|0;
    (FUNCTION_TABLE_iiii[$32 & 31]($0,0,0)|0);
    $33 = HEAP32[$26>>2]|0;
    $34 = ($33|0)==(0|0);
    $$ = $34 ? -1 : $29;
    HEAP32[$23>>2] = $24;
    HEAP32[$19>>2] = 0;
    HEAP32[$28>>2] = 0;
    HEAP32[$25>>2] = 0;
    HEAP32[$26>>2] = 0;
    $$1 = $$;
   }
  } else {
   $22 = (_printf_core($0,$1,$3,$5,$4)|0);
   $$1 = $22;
  }
  $35 = HEAP32[$0>>2]|0;
  $36 = $35 & 32;
  $37 = ($36|0)==(0);
  $$1$ = $37 ? $$1 : -1;
  $38 = $35 | $14;
  HEAP32[$0>>2] = $38;
  $39 = ($40|0)==(0);
  if (!($39)) {
   ___unlockfile($0);
  }
  $$0 = $$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$ = 0, $$$0259 = 0, $$$0262 = 0, $$$0269 = 0, $$$4266 = 0, $$$5 = 0, $$0 = 0, $$0228 = 0, $$0228$ = 0, $$0229322 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa357 = 0, $$0240321 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0;
 var $$0249306 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0254$$0254$ = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262311 = 0, $$0269 = 0, $$0269$phi = 0, $$1 = 0, $$1230333 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241332 = 0, $$1244320 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0;
 var $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242305 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2256$ = 0, $$2256$$$2256 = 0, $$2261 = 0, $$2271 = 0, $$284$ = 0, $$289 = 0, $$290 = 0, $$3257 = 0, $$3265 = 0;
 var $$3272 = 0, $$3303 = 0, $$377 = 0, $$4258355 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa295 = 0, $$pre = 0, $$pre346 = 0, $$pre347 = 0, $$pre347$pre = 0, $$pre349 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0;
 var $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0;
 var $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0;
 var $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0;
 var $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0;
 var $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0;
 var $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0;
 var $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0;
 var $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0;
 var $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0;
 var $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0;
 var $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0;
 var $306 = 0.0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0;
 var $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $isdigit = 0, $isdigit275 = 0, $isdigit277 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp274 = 0;
 var $isdigittmp276 = 0, $narrow = 0, $or$cond = 0, $or$cond281 = 0, $or$cond283 = 0, $or$cond286 = 0, $storemerge = 0, $storemerge273310 = 0, $storemerge278 = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $5 = sp + 16|0;
 $6 = sp;
 $7 = sp + 24|0;
 $8 = sp + 8|0;
 $9 = sp + 20|0;
 HEAP32[$5>>2] = $1;
 $10 = ($0|0)!=(0|0);
 $11 = ((($7)) + 40|0);
 $12 = $11;
 $13 = ((($7)) + 39|0);
 $14 = ((($8)) + 4|0);
 $$0243 = 0;$$0247 = 0;$$0269 = 0;$21 = $1;
 L1: while(1) {
  $15 = ($$0247|0)>(-1);
  do {
   if ($15) {
    $16 = (2147483647 - ($$0247))|0;
    $17 = ($$0243|0)>($16|0);
    if ($17) {
     $18 = (___errno_location()|0);
     HEAP32[$18>>2] = 75;
     $$1248 = -1;
     break;
    } else {
     $19 = (($$0243) + ($$0247))|0;
     $$1248 = $19;
     break;
    }
   } else {
    $$1248 = $$0247;
   }
  } while(0);
  $20 = HEAP8[$21>>0]|0;
  $22 = ($20<<24>>24)==(0);
  if ($22) {
   label = 87;
   break;
  } else {
   $23 = $20;$25 = $21;
  }
  L9: while(1) {
   switch ($23<<24>>24) {
   case 37:  {
    $$0249306 = $25;$27 = $25;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $$0249$lcssa = $25;$39 = $25;
    break L9;
    break;
   }
   default: {
   }
   }
   $24 = ((($25)) + 1|0);
   HEAP32[$5>>2] = $24;
   $$pre = HEAP8[$24>>0]|0;
   $23 = $$pre;$25 = $24;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $26 = ((($27)) + 1|0);
     $28 = HEAP8[$26>>0]|0;
     $29 = ($28<<24>>24)==(37);
     if (!($29)) {
      $$0249$lcssa = $$0249306;$39 = $27;
      break L12;
     }
     $30 = ((($$0249306)) + 1|0);
     $31 = ((($27)) + 2|0);
     HEAP32[$5>>2] = $31;
     $32 = HEAP8[$31>>0]|0;
     $33 = ($32<<24>>24)==(37);
     if ($33) {
      $$0249306 = $30;$27 = $31;
      label = 9;
     } else {
      $$0249$lcssa = $30;$39 = $31;
      break;
     }
    }
   }
  } while(0);
  $34 = $$0249$lcssa;
  $35 = $21;
  $36 = (($34) - ($35))|0;
  if ($10) {
   _out($0,$21,$36);
  }
  $37 = ($36|0)==(0);
  if (!($37)) {
   $$0269$phi = $$0269;$$0243 = $36;$$0247 = $$1248;$21 = $39;$$0269 = $$0269$phi;
   continue;
  }
  $38 = ((($39)) + 1|0);
  $40 = HEAP8[$38>>0]|0;
  $41 = $40 << 24 >> 24;
  $isdigittmp = (($41) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $42 = ((($39)) + 2|0);
   $43 = HEAP8[$42>>0]|0;
   $44 = ($43<<24>>24)==(36);
   $45 = ((($39)) + 3|0);
   $$377 = $44 ? $45 : $38;
   $$$0269 = $44 ? 1 : $$0269;
   $isdigittmp$ = $44 ? $isdigittmp : -1;
   $$0253 = $isdigittmp$;$$1270 = $$$0269;$storemerge = $$377;
  } else {
   $$0253 = -1;$$1270 = $$0269;$storemerge = $38;
  }
  HEAP32[$5>>2] = $storemerge;
  $46 = HEAP8[$storemerge>>0]|0;
  $47 = $46 << 24 >> 24;
  $48 = (($47) + -32)|0;
  $49 = ($48>>>0)<(32);
  L24: do {
   if ($49) {
    $$0262311 = 0;$329 = $46;$51 = $48;$storemerge273310 = $storemerge;
    while(1) {
     $50 = 1 << $51;
     $52 = $50 & 75913;
     $53 = ($52|0)==(0);
     if ($53) {
      $$0262$lcssa = $$0262311;$$lcssa295 = $329;$62 = $storemerge273310;
      break L24;
     }
     $54 = $50 | $$0262311;
     $55 = ((($storemerge273310)) + 1|0);
     HEAP32[$5>>2] = $55;
     $56 = HEAP8[$55>>0]|0;
     $57 = $56 << 24 >> 24;
     $58 = (($57) + -32)|0;
     $59 = ($58>>>0)<(32);
     if ($59) {
      $$0262311 = $54;$329 = $56;$51 = $58;$storemerge273310 = $55;
     } else {
      $$0262$lcssa = $54;$$lcssa295 = $56;$62 = $55;
      break;
     }
    }
   } else {
    $$0262$lcssa = 0;$$lcssa295 = $46;$62 = $storemerge;
   }
  } while(0);
  $60 = ($$lcssa295<<24>>24)==(42);
  if ($60) {
   $61 = ((($62)) + 1|0);
   $63 = HEAP8[$61>>0]|0;
   $64 = $63 << 24 >> 24;
   $isdigittmp276 = (($64) + -48)|0;
   $isdigit277 = ($isdigittmp276>>>0)<(10);
   if ($isdigit277) {
    $65 = ((($62)) + 2|0);
    $66 = HEAP8[$65>>0]|0;
    $67 = ($66<<24>>24)==(36);
    if ($67) {
     $68 = (($4) + ($isdigittmp276<<2)|0);
     HEAP32[$68>>2] = 10;
     $69 = HEAP8[$61>>0]|0;
     $70 = $69 << 24 >> 24;
     $71 = (($70) + -48)|0;
     $72 = (($3) + ($71<<3)|0);
     $73 = $72;
     $74 = $73;
     $75 = HEAP32[$74>>2]|0;
     $76 = (($73) + 4)|0;
     $77 = $76;
     $78 = HEAP32[$77>>2]|0;
     $79 = ((($62)) + 3|0);
     $$0259 = $75;$$2271 = 1;$storemerge278 = $79;
    } else {
     label = 23;
    }
   } else {
    label = 23;
   }
   if ((label|0) == 23) {
    label = 0;
    $80 = ($$1270|0)==(0);
    if (!($80)) {
     $$0 = -1;
     break;
    }
    if ($10) {
     $arglist_current = HEAP32[$2>>2]|0;
     $81 = $arglist_current;
     $82 = ((0) + 4|0);
     $expanded4 = $82;
     $expanded = (($expanded4) - 1)|0;
     $83 = (($81) + ($expanded))|0;
     $84 = ((0) + 4|0);
     $expanded8 = $84;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $85 = $83 & $expanded6;
     $86 = $85;
     $87 = HEAP32[$86>>2]|0;
     $arglist_next = ((($86)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $$0259 = $87;$$2271 = 0;$storemerge278 = $61;
    } else {
     $$0259 = 0;$$2271 = 0;$storemerge278 = $61;
    }
   }
   HEAP32[$5>>2] = $storemerge278;
   $88 = ($$0259|0)<(0);
   $89 = $$0262$lcssa | 8192;
   $90 = (0 - ($$0259))|0;
   $$$0262 = $88 ? $89 : $$0262$lcssa;
   $$$0259 = $88 ? $90 : $$0259;
   $$1260 = $$$0259;$$1263 = $$$0262;$$3272 = $$2271;$94 = $storemerge278;
  } else {
   $91 = (_getint($5)|0);
   $92 = ($91|0)<(0);
   if ($92) {
    $$0 = -1;
    break;
   }
   $$pre346 = HEAP32[$5>>2]|0;
   $$1260 = $91;$$1263 = $$0262$lcssa;$$3272 = $$1270;$94 = $$pre346;
  }
  $93 = HEAP8[$94>>0]|0;
  $95 = ($93<<24>>24)==(46);
  do {
   if ($95) {
    $96 = ((($94)) + 1|0);
    $97 = HEAP8[$96>>0]|0;
    $98 = ($97<<24>>24)==(42);
    if (!($98)) {
     $125 = ((($94)) + 1|0);
     HEAP32[$5>>2] = $125;
     $126 = (_getint($5)|0);
     $$pre347$pre = HEAP32[$5>>2]|0;
     $$0254 = $126;$$pre347 = $$pre347$pre;
     break;
    }
    $99 = ((($94)) + 2|0);
    $100 = HEAP8[$99>>0]|0;
    $101 = $100 << 24 >> 24;
    $isdigittmp274 = (($101) + -48)|0;
    $isdigit275 = ($isdigittmp274>>>0)<(10);
    if ($isdigit275) {
     $102 = ((($94)) + 3|0);
     $103 = HEAP8[$102>>0]|0;
     $104 = ($103<<24>>24)==(36);
     if ($104) {
      $105 = (($4) + ($isdigittmp274<<2)|0);
      HEAP32[$105>>2] = 10;
      $106 = HEAP8[$99>>0]|0;
      $107 = $106 << 24 >> 24;
      $108 = (($107) + -48)|0;
      $109 = (($3) + ($108<<3)|0);
      $110 = $109;
      $111 = $110;
      $112 = HEAP32[$111>>2]|0;
      $113 = (($110) + 4)|0;
      $114 = $113;
      $115 = HEAP32[$114>>2]|0;
      $116 = ((($94)) + 4|0);
      HEAP32[$5>>2] = $116;
      $$0254 = $112;$$pre347 = $116;
      break;
     }
    }
    $117 = ($$3272|0)==(0);
    if (!($117)) {
     $$0 = -1;
     break L1;
    }
    if ($10) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $118 = $arglist_current2;
     $119 = ((0) + 4|0);
     $expanded11 = $119;
     $expanded10 = (($expanded11) - 1)|0;
     $120 = (($118) + ($expanded10))|0;
     $121 = ((0) + 4|0);
     $expanded15 = $121;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $122 = $120 & $expanded13;
     $123 = $122;
     $124 = HEAP32[$123>>2]|0;
     $arglist_next3 = ((($123)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $330 = $124;
    } else {
     $330 = 0;
    }
    HEAP32[$5>>2] = $99;
    $$0254 = $330;$$pre347 = $99;
   } else {
    $$0254 = -1;$$pre347 = $94;
   }
  } while(0);
  $$0252 = 0;$128 = $$pre347;
  while(1) {
   $127 = HEAP8[$128>>0]|0;
   $129 = $127 << 24 >> 24;
   $130 = (($129) + -65)|0;
   $131 = ($130>>>0)>(57);
   if ($131) {
    $$0 = -1;
    break L1;
   }
   $132 = ((($128)) + 1|0);
   HEAP32[$5>>2] = $132;
   $133 = HEAP8[$128>>0]|0;
   $134 = $133 << 24 >> 24;
   $135 = (($134) + -65)|0;
   $136 = ((3854 + (($$0252*58)|0)|0) + ($135)|0);
   $137 = HEAP8[$136>>0]|0;
   $138 = $137&255;
   $139 = (($138) + -1)|0;
   $140 = ($139>>>0)<(8);
   if ($140) {
    $$0252 = $138;$128 = $132;
   } else {
    break;
   }
  }
  $141 = ($137<<24>>24)==(0);
  if ($141) {
   $$0 = -1;
   break;
  }
  $142 = ($137<<24>>24)==(19);
  $143 = ($$0253|0)>(-1);
  do {
   if ($142) {
    if ($143) {
     $$0 = -1;
     break L1;
    } else {
     label = 49;
    }
   } else {
    if ($143) {
     $144 = (($4) + ($$0253<<2)|0);
     HEAP32[$144>>2] = $138;
     $145 = (($3) + ($$0253<<3)|0);
     $146 = $145;
     $147 = $146;
     $148 = HEAP32[$147>>2]|0;
     $149 = (($146) + 4)|0;
     $150 = $149;
     $151 = HEAP32[$150>>2]|0;
     $152 = $6;
     $153 = $152;
     HEAP32[$153>>2] = $148;
     $154 = (($152) + 4)|0;
     $155 = $154;
     HEAP32[$155>>2] = $151;
     label = 49;
     break;
    }
    if (!($10)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg($6,$138,$2);
   }
  } while(0);
  if ((label|0) == 49) {
   label = 0;
   if (!($10)) {
    $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue;
   }
  }
  $156 = HEAP8[$128>>0]|0;
  $157 = $156 << 24 >> 24;
  $158 = ($$0252|0)!=(0);
  $159 = $157 & 15;
  $160 = ($159|0)==(3);
  $or$cond281 = $158 & $160;
  $161 = $157 & -33;
  $$0235 = $or$cond281 ? $161 : $157;
  $162 = $$1263 & 8192;
  $163 = ($162|0)==(0);
  $164 = $$1263 & -65537;
  $$1263$ = $163 ? $$1263 : $164;
  L71: do {
   switch ($$0235|0) {
   case 110:  {
    $trunc = $$0252&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $171 = HEAP32[$6>>2]|0;
     HEAP32[$171>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 1:  {
     $172 = HEAP32[$6>>2]|0;
     HEAP32[$172>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 2:  {
     $173 = ($$1248|0)<(0);
     $174 = $173 << 31 >> 31;
     $175 = HEAP32[$6>>2]|0;
     $176 = $175;
     $177 = $176;
     HEAP32[$177>>2] = $$1248;
     $178 = (($176) + 4)|0;
     $179 = $178;
     HEAP32[$179>>2] = $174;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 3:  {
     $180 = $$1248&65535;
     $181 = HEAP32[$6>>2]|0;
     HEAP16[$181>>1] = $180;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 4:  {
     $182 = $$1248&255;
     $183 = HEAP32[$6>>2]|0;
     HEAP8[$183>>0] = $182;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 6:  {
     $184 = HEAP32[$6>>2]|0;
     HEAP32[$184>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 7:  {
     $185 = ($$1248|0)<(0);
     $186 = $185 << 31 >> 31;
     $187 = HEAP32[$6>>2]|0;
     $188 = $187;
     $189 = $188;
     HEAP32[$189>>2] = $$1248;
     $190 = (($188) + 4)|0;
     $191 = $190;
     HEAP32[$191>>2] = $186;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    default: {
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $192 = ($$0254>>>0)>(8);
    $193 = $192 ? $$0254 : 8;
    $194 = $$1263$ | 8;
    $$1236 = 120;$$1255 = $193;$$3265 = $194;
    label = 61;
    break;
   }
   case 88: case 120:  {
    $$1236 = $$0235;$$1255 = $$0254;$$3265 = $$1263$;
    label = 61;
    break;
   }
   case 111:  {
    $210 = $6;
    $211 = $210;
    $212 = HEAP32[$211>>2]|0;
    $213 = (($210) + 4)|0;
    $214 = $213;
    $215 = HEAP32[$214>>2]|0;
    $216 = (_fmt_o($212,$215,$11)|0);
    $217 = $$1263$ & 8;
    $218 = ($217|0)==(0);
    $219 = $216;
    $220 = (($12) - ($219))|0;
    $221 = ($$0254|0)>($220|0);
    $222 = (($220) + 1)|0;
    $223 = $218 | $221;
    $$0254$$0254$ = $223 ? $$0254 : $222;
    $$0228 = $216;$$1233 = 0;$$1238 = 4318;$$2256 = $$0254$$0254$;$$4266 = $$1263$;$248 = $212;$250 = $215;
    label = 67;
    break;
   }
   case 105: case 100:  {
    $224 = $6;
    $225 = $224;
    $226 = HEAP32[$225>>2]|0;
    $227 = (($224) + 4)|0;
    $228 = $227;
    $229 = HEAP32[$228>>2]|0;
    $230 = ($229|0)<(0);
    if ($230) {
     $231 = (_i64Subtract(0,0,($226|0),($229|0))|0);
     $232 = tempRet0;
     $233 = $6;
     $234 = $233;
     HEAP32[$234>>2] = $231;
     $235 = (($233) + 4)|0;
     $236 = $235;
     HEAP32[$236>>2] = $232;
     $$0232 = 1;$$0237 = 4318;$242 = $231;$243 = $232;
     label = 66;
     break L71;
    } else {
     $237 = $$1263$ & 2048;
     $238 = ($237|0)==(0);
     $239 = $$1263$ & 1;
     $240 = ($239|0)==(0);
     $$ = $240 ? 4318 : (4320);
     $$$ = $238 ? $$ : (4319);
     $241 = $$1263$ & 2049;
     $narrow = ($241|0)!=(0);
     $$284$ = $narrow&1;
     $$0232 = $$284$;$$0237 = $$$;$242 = $226;$243 = $229;
     label = 66;
     break L71;
    }
    break;
   }
   case 117:  {
    $165 = $6;
    $166 = $165;
    $167 = HEAP32[$166>>2]|0;
    $168 = (($165) + 4)|0;
    $169 = $168;
    $170 = HEAP32[$169>>2]|0;
    $$0232 = 0;$$0237 = 4318;$242 = $167;$243 = $170;
    label = 66;
    break;
   }
   case 99:  {
    $259 = $6;
    $260 = $259;
    $261 = HEAP32[$260>>2]|0;
    $262 = (($259) + 4)|0;
    $263 = $262;
    $264 = HEAP32[$263>>2]|0;
    $265 = $261&255;
    HEAP8[$13>>0] = $265;
    $$2 = $13;$$2234 = 0;$$2239 = 4318;$$2251 = $11;$$5 = 1;$$6268 = $164;
    break;
   }
   case 109:  {
    $266 = (___errno_location()|0);
    $267 = HEAP32[$266>>2]|0;
    $268 = (_strerror($267)|0);
    $$1 = $268;
    label = 71;
    break;
   }
   case 115:  {
    $269 = HEAP32[$6>>2]|0;
    $270 = ($269|0)!=(0|0);
    $271 = $270 ? $269 : 4328;
    $$1 = $271;
    label = 71;
    break;
   }
   case 67:  {
    $278 = $6;
    $279 = $278;
    $280 = HEAP32[$279>>2]|0;
    $281 = (($278) + 4)|0;
    $282 = $281;
    $283 = HEAP32[$282>>2]|0;
    HEAP32[$8>>2] = $280;
    HEAP32[$14>>2] = 0;
    HEAP32[$6>>2] = $8;
    $$4258355 = -1;$331 = $8;
    label = 75;
    break;
   }
   case 83:  {
    $$pre349 = HEAP32[$6>>2]|0;
    $284 = ($$0254|0)==(0);
    if ($284) {
     _pad_684($0,32,$$1260,0,$$1263$);
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$4258355 = $$0254;$331 = $$pre349;
     label = 75;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $306 = +HEAPF64[$6>>3];
    $307 = (_fmt_fp($0,$306,$$1260,$$0254,$$1263$,$$0235)|0);
    $$0243 = $307;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue L1;
    break;
   }
   default: {
    $$2 = $21;$$2234 = 0;$$2239 = 4318;$$2251 = $11;$$5 = $$0254;$$6268 = $$1263$;
   }
   }
  } while(0);
  L95: do {
   if ((label|0) == 61) {
    label = 0;
    $195 = $6;
    $196 = $195;
    $197 = HEAP32[$196>>2]|0;
    $198 = (($195) + 4)|0;
    $199 = $198;
    $200 = HEAP32[$199>>2]|0;
    $201 = $$1236 & 32;
    $202 = (_fmt_x($197,$200,$11,$201)|0);
    $203 = ($197|0)==(0);
    $204 = ($200|0)==(0);
    $205 = $203 & $204;
    $206 = $$3265 & 8;
    $207 = ($206|0)==(0);
    $or$cond283 = $207 | $205;
    $208 = $$1236 >> 4;
    $209 = (4318 + ($208)|0);
    $$289 = $or$cond283 ? 4318 : $209;
    $$290 = $or$cond283 ? 0 : 2;
    $$0228 = $202;$$1233 = $$290;$$1238 = $$289;$$2256 = $$1255;$$4266 = $$3265;$248 = $197;$250 = $200;
    label = 67;
   }
   else if ((label|0) == 66) {
    label = 0;
    $244 = (_fmt_u($242,$243,$11)|0);
    $$0228 = $244;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $$1263$;$248 = $242;$250 = $243;
    label = 67;
   }
   else if ((label|0) == 71) {
    label = 0;
    $272 = (_memchr($$1,0,$$0254)|0);
    $273 = ($272|0)==(0|0);
    $274 = $272;
    $275 = $$1;
    $276 = (($274) - ($275))|0;
    $277 = (($$1) + ($$0254)|0);
    $$3257 = $273 ? $$0254 : $276;
    $$1250 = $273 ? $277 : $272;
    $$2 = $$1;$$2234 = 0;$$2239 = 4318;$$2251 = $$1250;$$5 = $$3257;$$6268 = $164;
   }
   else if ((label|0) == 75) {
    label = 0;
    $$0229322 = $331;$$0240321 = 0;$$1244320 = 0;
    while(1) {
     $285 = HEAP32[$$0229322>>2]|0;
     $286 = ($285|0)==(0);
     if ($286) {
      $$0240$lcssa = $$0240321;$$2245 = $$1244320;
      break;
     }
     $287 = (_wctomb($9,$285)|0);
     $288 = ($287|0)<(0);
     $289 = (($$4258355) - ($$0240321))|0;
     $290 = ($287>>>0)>($289>>>0);
     $or$cond286 = $288 | $290;
     if ($or$cond286) {
      $$0240$lcssa = $$0240321;$$2245 = $287;
      break;
     }
     $291 = ((($$0229322)) + 4|0);
     $292 = (($287) + ($$0240321))|0;
     $293 = ($$4258355>>>0)>($292>>>0);
     if ($293) {
      $$0229322 = $291;$$0240321 = $292;$$1244320 = $287;
     } else {
      $$0240$lcssa = $292;$$2245 = $287;
      break;
     }
    }
    $294 = ($$2245|0)<(0);
    if ($294) {
     $$0 = -1;
     break L1;
    }
    _pad_684($0,32,$$1260,$$0240$lcssa,$$1263$);
    $295 = ($$0240$lcssa|0)==(0);
    if ($295) {
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$1230333 = $331;$$1241332 = 0;
     while(1) {
      $296 = HEAP32[$$1230333>>2]|0;
      $297 = ($296|0)==(0);
      if ($297) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $298 = (_wctomb($9,$296)|0);
      $299 = (($298) + ($$1241332))|0;
      $300 = ($299|0)>($$0240$lcssa|0);
      if ($300) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $301 = ((($$1230333)) + 4|0);
      _out($0,$9,$298);
      $302 = ($299>>>0)<($$0240$lcssa>>>0);
      if ($302) {
       $$1230333 = $301;$$1241332 = $299;
      } else {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 67) {
   label = 0;
   $245 = ($$2256|0)>(-1);
   $246 = $$4266 & -65537;
   $$$4266 = $245 ? $246 : $$4266;
   $247 = ($248|0)!=(0);
   $249 = ($250|0)!=(0);
   $251 = $247 | $249;
   $252 = ($$2256|0)!=(0);
   $or$cond = $252 | $251;
   $253 = $$0228;
   $254 = (($12) - ($253))|0;
   $255 = $251 ^ 1;
   $256 = $255&1;
   $257 = (($256) + ($254))|0;
   $258 = ($$2256|0)>($257|0);
   $$2256$ = $258 ? $$2256 : $257;
   $$2256$$$2256 = $or$cond ? $$2256$ : $$2256;
   $$0228$ = $or$cond ? $$0228 : $11;
   $$2 = $$0228$;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $11;$$5 = $$2256$$$2256;$$6268 = $$$4266;
  }
  else if ((label|0) == 84) {
   label = 0;
   $303 = $$1263$ ^ 8192;
   _pad_684($0,32,$$1260,$$0240$lcssa357,$303);
   $304 = ($$1260|0)>($$0240$lcssa357|0);
   $305 = $304 ? $$1260 : $$0240$lcssa357;
   $$0243 = $305;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
   continue;
  }
  $308 = $$2251;
  $309 = $$2;
  $310 = (($308) - ($309))|0;
  $311 = ($$5|0)<($310|0);
  $$$5 = $311 ? $310 : $$5;
  $312 = (($$$5) + ($$2234))|0;
  $313 = ($$1260|0)<($312|0);
  $$2261 = $313 ? $312 : $$1260;
  _pad_684($0,32,$$2261,$312,$$6268);
  _out($0,$$2239,$$2234);
  $314 = $$6268 ^ 65536;
  _pad_684($0,48,$$2261,$312,$314);
  _pad_684($0,48,$$$5,$310,0);
  _out($0,$$2,$310);
  $315 = $$6268 ^ 8192;
  _pad_684($0,32,$$2261,$312,$315);
  $$0243 = $$2261;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
 }
 L114: do {
  if ((label|0) == 87) {
   $316 = ($0|0)==(0|0);
   if ($316) {
    $317 = ($$0269|0)==(0);
    if ($317) {
     $$0 = 0;
    } else {
     $$2242305 = 1;
     while(1) {
      $318 = (($4) + ($$2242305<<2)|0);
      $319 = HEAP32[$318>>2]|0;
      $320 = ($319|0)==(0);
      if ($320) {
       $$3303 = $$2242305;
       break;
      }
      $321 = (($3) + ($$2242305<<3)|0);
      _pop_arg($321,$319,$2);
      $322 = (($$2242305) + 1)|0;
      $323 = ($322|0)<(10);
      if ($323) {
       $$2242305 = $322;
      } else {
       $$0 = 1;
       break L114;
      }
     }
     while(1) {
      $326 = (($4) + ($$3303<<2)|0);
      $327 = HEAP32[$326>>2]|0;
      $328 = ($327|0)==(0);
      $325 = (($$3303) + 1)|0;
      if (!($328)) {
       $$0 = -1;
       break L114;
      }
      $324 = ($325|0)<(10);
      if ($324) {
       $$3303 = $325;
      } else {
       $$0 = 1;
       break;
      }
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _out($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = $3 & 32;
 $5 = ($4|0)==(0);
 if ($5) {
  (___fwritex($1,$2,$0)|0);
 }
 return;
}
function _getint($0) {
 $0 = $0|0;
 var $$0$lcssa = 0, $$06 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $isdigit = 0, $isdigit5 = 0, $isdigittmp = 0, $isdigittmp4 = 0, $isdigittmp7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $isdigittmp4 = (($3) + -48)|0;
 $isdigit5 = ($isdigittmp4>>>0)<(10);
 if ($isdigit5) {
  $$06 = 0;$7 = $1;$isdigittmp7 = $isdigittmp4;
  while(1) {
   $4 = ($$06*10)|0;
   $5 = (($isdigittmp7) + ($4))|0;
   $6 = ((($7)) + 1|0);
   HEAP32[$0>>2] = $6;
   $8 = HEAP8[$6>>0]|0;
   $9 = $8 << 24 >> 24;
   $isdigittmp = (($9) + -48)|0;
   $isdigit = ($isdigittmp>>>0)<(10);
   if ($isdigit) {
    $$06 = $5;$7 = $6;$isdigittmp7 = $isdigittmp;
   } else {
    $$0$lcssa = $5;
    break;
   }
  }
 } else {
  $$0$lcssa = 0;
 }
 return ($$0$lcssa|0);
}
function _pop_arg($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$05$lcssa = 0, $$056 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ($0|0)==(0);
 $5 = ($1|0)==(0);
 $6 = $4 & $5;
 if ($6) {
  $$05$lcssa = $2;
 } else {
  $$056 = $2;$15 = $1;$8 = $0;
  while(1) {
   $7 = $8 & 15;
   $9 = (4370 + ($7)|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10&255;
   $12 = $11 | $3;
   $13 = $12&255;
   $14 = ((($$056)) + -1|0);
   HEAP8[$14>>0] = $13;
   $16 = (_bitshift64Lshr(($8|0),($15|0),4)|0);
   $17 = tempRet0;
   $18 = ($16|0)==(0);
   $19 = ($17|0)==(0);
   $20 = $18 & $19;
   if ($20) {
    $$05$lcssa = $14;
    break;
   } else {
    $$056 = $14;$15 = $17;$8 = $16;
   }
  }
 }
 return ($$05$lcssa|0);
}
function _fmt_o($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0);
 $4 = ($1|0)==(0);
 $5 = $3 & $4;
 if ($5) {
  $$0$lcssa = $2;
 } else {
  $$06 = $2;$11 = $1;$7 = $0;
  while(1) {
   $6 = $7&255;
   $8 = $6 & 7;
   $9 = $8 | 48;
   $10 = ((($$06)) + -1|0);
   HEAP8[$10>>0] = $9;
   $12 = (_bitshift64Lshr(($7|0),($11|0),3)|0);
   $13 = tempRet0;
   $14 = ($12|0)==(0);
   $15 = ($13|0)==(0);
   $16 = $14 & $15;
   if ($16) {
    $$0$lcssa = $10;
    break;
   } else {
    $$06 = $10;$11 = $13;$7 = $12;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___uremdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = $10&255;
   $13 = $12 | 48;
   $14 = ((($$0914)) + -1|0);
   HEAP8[$14>>0] = $13;
   $15 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $16 = tempRet0;
   $17 = ($9>>>0)>(9);
   $18 = ($8>>>0)>(4294967295);
   $19 = ($9|0)==(9);
   $20 = $19 & $18;
   $21 = $17 | $20;
   if ($21) {
    $$0914 = $14;$8 = $15;$9 = $16;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $15;$$09$lcssa = $14;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $22 = ($$010$lcssa$off0|0)==(0);
 if ($22) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $23 = (($$012>>>0) % 10)&-1;
   $24 = $23 | 48;
   $25 = $24&255;
   $26 = ((($$111)) + -1|0);
   HEAP8[$26>>0] = $25;
   $27 = (($$012>>>0) / 10)&-1;
   $28 = ($$012>>>0)<(10);
   if ($28) {
    $$1$lcssa = $26;
    break;
   } else {
    $$012 = $27;$$111 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___pthread_self_104()|0);
 $2 = ((($1)) + 188|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (___strerror_l($0,$3)|0);
 return ($4|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   $$2 = $$035$lcssa;$$3 = 0;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $$2 = $$035$lcssa65;$$3 = $$036$lcssa64;
   } else {
    $20 = Math_imul($3, 16843009)|0;
    $21 = ($$036$lcssa64>>>0)>(3);
    L11: do {
     if ($21) {
      $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
      while(1) {
       $22 = HEAP32[$$046>>2]|0;
       $23 = $22 ^ $20;
       $24 = (($23) + -16843009)|0;
       $25 = $23 & -2139062144;
       $26 = $25 ^ -2139062144;
       $27 = $26 & $24;
       $28 = ($27|0)==(0);
       if (!($28)) {
        break;
       }
       $29 = ((($$046)) + 4|0);
       $30 = (($$13745) + -4)|0;
       $31 = ($30>>>0)>(3);
       if ($31) {
        $$046 = $29;$$13745 = $30;
       } else {
        $$0$lcssa = $29;$$137$lcssa = $30;
        label = 11;
        break L11;
       }
      }
      $$140 = $$046;$$23839 = $$13745;
     } else {
      $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $32 = ($$137$lcssa|0)==(0);
     if ($32) {
      $$2 = $$0$lcssa;$$3 = 0;
      break;
     } else {
      $$140 = $$0$lcssa;$$23839 = $$137$lcssa;
     }
    }
    while(1) {
     $33 = HEAP8[$$140>>0]|0;
     $34 = ($33<<24>>24)==($18<<24>>24);
     if ($34) {
      $$2 = $$140;$$3 = $$23839;
      break L8;
     }
     $35 = ((($$140)) + 1|0);
     $36 = (($$23839) + -1)|0;
     $37 = ($36|0)==(0);
     if ($37) {
      $$2 = $35;$$3 = 0;
      break;
     } else {
      $$140 = $35;$$23839 = $36;
     }
    }
   }
  }
 } while(0);
 $38 = ($$3|0)!=(0);
 $39 = $38 ? $$2 : 0;
 return ($39|0);
}
function _pad_684($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa = 0, $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 if ($or$cond) {
  $9 = (($2) - ($3))|0;
  $10 = ($9>>>0)<(256);
  $11 = $10 ? $9 : 256;
  _memset(($5|0),($1|0),($11|0))|0;
  $12 = ($9>>>0)>(255);
  if ($12) {
   $13 = (($2) - ($3))|0;
   $$011 = $9;
   while(1) {
    _out($0,$5,256);
    $14 = (($$011) + -256)|0;
    $15 = ($14>>>0)>(255);
    if ($15) {
     $$011 = $14;
    } else {
     break;
    }
   }
   $16 = $13 & 255;
   $$0$lcssa = $16;
  } else {
   $$0$lcssa = $9;
  }
  _out($0,$5,$$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _fmt_fp($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = +$1;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$ = 0, $$$ = 0, $$$$559 = 0.0, $$$3484 = 0, $$$3484691 = 0, $$$3484692 = 0, $$$3501 = 0, $$$4502 = 0, $$$542 = 0.0, $$$559 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463584 = 0, $$0464594 = 0, $$0471 = 0.0, $$0479 = 0, $$0487642 = 0, $$0488 = 0, $$0488653 = 0, $$0488655 = 0;
 var $$0496$$9 = 0, $$0497654 = 0, $$0498 = 0, $$0509582 = 0.0, $$0510 = 0, $$0511 = 0, $$0514637 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0525 = 0, $$0527 = 0, $$0527629 = 0, $$0527631 = 0, $$0530636 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0;
 var $$1480 = 0, $$1482$lcssa = 0, $$1482661 = 0, $$1489641 = 0, $$1499$lcssa = 0, $$1499660 = 0, $$1508583 = 0, $$1512$lcssa = 0, $$1512607 = 0, $$1515 = 0, $$1524 = 0, $$1526 = 0, $$1528614 = 0, $$1531$lcssa = 0, $$1531630 = 0, $$1598 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2476$$547 = 0;
 var $$2476$$549 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516618 = 0, $$2529 = 0, $$2532617 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484648 = 0, $$3501$lcssa = 0, $$3501647 = 0, $$3533613 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478590 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0;
 var $$5$lcssa = 0, $$534$ = 0, $$539 = 0, $$539$ = 0, $$542 = 0.0, $$546 = 0, $$548 = 0, $$5486$lcssa = 0, $$5486623 = 0, $$5493597 = 0, $$5519$ph = 0, $$555 = 0, $$556 = 0, $$559 = 0.0, $$5602 = 0, $$6 = 0, $$6494589 = 0, $$7495601 = 0, $$7505 = 0, $$7505$ = 0;
 var $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa673 = 0, $$neg = 0, $$neg567 = 0, $$pn = 0, $$pn566 = 0, $$pr = 0, $$pr564 = 0, $$pre = 0, $$pre$phi690Z2D = 0, $$pre689 = 0, $$sink545$lcssa = 0, $$sink545622 = 0, $$sink562 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0.0, $117 = 0.0, $118 = 0.0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0.0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0;
 var $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0.0, $229 = 0.0, $23 = 0;
 var $230 = 0, $231 = 0.0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0;
 var $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0;
 var $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0;
 var $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0.0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0.0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0;
 var $narrow = 0, $not$ = 0, $notlhs = 0, $notrhs = 0, $or$cond = 0, $or$cond3$not = 0, $or$cond537 = 0, $or$cond541 = 0, $or$cond544 = 0, $or$cond554 = 0, $or$cond6 = 0, $scevgep684 = 0, $scevgep684685 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(560|0);
 $6 = sp + 8|0;
 $7 = sp;
 $8 = sp + 524|0;
 $9 = $8;
 $10 = sp + 512|0;
 HEAP32[$7>>2] = 0;
 $11 = ((($10)) + 12|0);
 (___DOUBLE_BITS_685($1)|0);
 $12 = tempRet0;
 $13 = ($12|0)<(0);
 if ($13) {
  $14 = -$1;
  $$0471 = $14;$$0520 = 1;$$0521 = 4335;
 } else {
  $15 = $4 & 2048;
  $16 = ($15|0)==(0);
  $17 = $4 & 1;
  $18 = ($17|0)==(0);
  $$ = $18 ? (4336) : (4341);
  $$$ = $16 ? $$ : (4338);
  $19 = $4 & 2049;
  $narrow = ($19|0)!=(0);
  $$534$ = $narrow&1;
  $$0471 = $1;$$0520 = $$534$;$$0521 = $$$;
 }
 (___DOUBLE_BITS_685($$0471)|0);
 $20 = tempRet0;
 $21 = $20 & 2146435072;
 $22 = ($21>>>0)<(2146435072);
 $23 = (0)<(0);
 $24 = ($21|0)==(2146435072);
 $25 = $24 & $23;
 $26 = $22 | $25;
 do {
  if ($26) {
   $35 = (+_frexpl($$0471,$7));
   $36 = $35 * 2.0;
   $37 = $36 != 0.0;
   if ($37) {
    $38 = HEAP32[$7>>2]|0;
    $39 = (($38) + -1)|0;
    HEAP32[$7>>2] = $39;
   }
   $40 = $5 | 32;
   $41 = ($40|0)==(97);
   if ($41) {
    $42 = $5 & 32;
    $43 = ($42|0)==(0);
    $44 = ((($$0521)) + 9|0);
    $$0521$ = $43 ? $$0521 : $44;
    $45 = $$0520 | 2;
    $46 = ($3>>>0)>(11);
    $47 = (12 - ($3))|0;
    $48 = ($47|0)==(0);
    $49 = $46 | $48;
    do {
     if ($49) {
      $$1472 = $36;
     } else {
      $$0509582 = 8.0;$$1508583 = $47;
      while(1) {
       $50 = (($$1508583) + -1)|0;
       $51 = $$0509582 * 16.0;
       $52 = ($50|0)==(0);
       if ($52) {
        break;
       } else {
        $$0509582 = $51;$$1508583 = $50;
       }
      }
      $53 = HEAP8[$$0521$>>0]|0;
      $54 = ($53<<24>>24)==(45);
      if ($54) {
       $55 = -$36;
       $56 = $55 - $51;
       $57 = $51 + $56;
       $58 = -$57;
       $$1472 = $58;
       break;
      } else {
       $59 = $36 + $51;
       $60 = $59 - $51;
       $$1472 = $60;
       break;
      }
     }
    } while(0);
    $61 = HEAP32[$7>>2]|0;
    $62 = ($61|0)<(0);
    $63 = (0 - ($61))|0;
    $64 = $62 ? $63 : $61;
    $65 = ($64|0)<(0);
    $66 = $65 << 31 >> 31;
    $67 = (_fmt_u($64,$66,$11)|0);
    $68 = ($67|0)==($11|0);
    if ($68) {
     $69 = ((($10)) + 11|0);
     HEAP8[$69>>0] = 48;
     $$0511 = $69;
    } else {
     $$0511 = $67;
    }
    $70 = $61 >> 31;
    $71 = $70 & 2;
    $72 = (($71) + 43)|0;
    $73 = $72&255;
    $74 = ((($$0511)) + -1|0);
    HEAP8[$74>>0] = $73;
    $75 = (($5) + 15)|0;
    $76 = $75&255;
    $77 = ((($$0511)) + -2|0);
    HEAP8[$77>>0] = $76;
    $notrhs = ($3|0)<(1);
    $78 = $4 & 8;
    $79 = ($78|0)==(0);
    $$0523 = $8;$$2473 = $$1472;
    while(1) {
     $80 = (~~(($$2473)));
     $81 = (4370 + ($80)|0);
     $82 = HEAP8[$81>>0]|0;
     $83 = $82&255;
     $84 = $83 | $42;
     $85 = $84&255;
     $86 = ((($$0523)) + 1|0);
     HEAP8[$$0523>>0] = $85;
     $87 = (+($80|0));
     $88 = $$2473 - $87;
     $89 = $88 * 16.0;
     $90 = $86;
     $91 = (($90) - ($9))|0;
     $92 = ($91|0)==(1);
     if ($92) {
      $notlhs = $89 == 0.0;
      $or$cond3$not = $notrhs & $notlhs;
      $or$cond = $79 & $or$cond3$not;
      if ($or$cond) {
       $$1524 = $86;
      } else {
       $93 = ((($$0523)) + 2|0);
       HEAP8[$86>>0] = 46;
       $$1524 = $93;
      }
     } else {
      $$1524 = $86;
     }
     $94 = $89 != 0.0;
     if ($94) {
      $$0523 = $$1524;$$2473 = $89;
     } else {
      break;
     }
    }
    $95 = ($3|0)!=(0);
    $96 = $77;
    $97 = $11;
    $98 = $$1524;
    $99 = (($98) - ($9))|0;
    $100 = (($97) - ($96))|0;
    $101 = (($99) + -2)|0;
    $102 = ($101|0)<($3|0);
    $or$cond537 = $95 & $102;
    $103 = (($3) + 2)|0;
    $$pn = $or$cond537 ? $103 : $99;
    $$0525 = (($100) + ($45))|0;
    $104 = (($$0525) + ($$pn))|0;
    _pad_684($0,32,$2,$104,$4);
    _out($0,$$0521$,$45);
    $105 = $4 ^ 65536;
    _pad_684($0,48,$2,$104,$105);
    _out($0,$8,$99);
    $106 = (($$pn) - ($99))|0;
    _pad_684($0,48,$106,0,0);
    _out($0,$77,$100);
    $107 = $4 ^ 8192;
    _pad_684($0,32,$2,$104,$107);
    $$sink562 = $104;
    break;
   }
   $108 = ($3|0)<(0);
   $$539 = $108 ? 6 : $3;
   if ($37) {
    $109 = $36 * 268435456.0;
    $110 = HEAP32[$7>>2]|0;
    $111 = (($110) + -28)|0;
    HEAP32[$7>>2] = $111;
    $$3 = $109;$$pr = $111;
   } else {
    $$pre = HEAP32[$7>>2]|0;
    $$3 = $36;$$pr = $$pre;
   }
   $112 = ($$pr|0)<(0);
   $113 = ((($6)) + 288|0);
   $$556 = $112 ? $6 : $113;
   $$0498 = $$556;$$4 = $$3;
   while(1) {
    $114 = (~~(($$4))>>>0);
    HEAP32[$$0498>>2] = $114;
    $115 = ((($$0498)) + 4|0);
    $116 = (+($114>>>0));
    $117 = $$4 - $116;
    $118 = $117 * 1.0E+9;
    $119 = $118 != 0.0;
    if ($119) {
     $$0498 = $115;$$4 = $118;
    } else {
     break;
    }
   }
   $120 = ($$pr|0)>(0);
   if ($120) {
    $$1482661 = $$556;$$1499660 = $115;$122 = $$pr;
    while(1) {
     $121 = ($122|0)<(29);
     $123 = $121 ? $122 : 29;
     $$0488653 = ((($$1499660)) + -4|0);
     $124 = ($$0488653>>>0)<($$1482661>>>0);
     if ($124) {
      $$2483$ph = $$1482661;
     } else {
      $$0488655 = $$0488653;$$0497654 = 0;
      while(1) {
       $125 = HEAP32[$$0488655>>2]|0;
       $126 = (_bitshift64Shl(($125|0),0,($123|0))|0);
       $127 = tempRet0;
       $128 = (_i64Add(($126|0),($127|0),($$0497654|0),0)|0);
       $129 = tempRet0;
       $130 = (___uremdi3(($128|0),($129|0),1000000000,0)|0);
       $131 = tempRet0;
       HEAP32[$$0488655>>2] = $130;
       $132 = (___udivdi3(($128|0),($129|0),1000000000,0)|0);
       $133 = tempRet0;
       $$0488 = ((($$0488655)) + -4|0);
       $134 = ($$0488>>>0)<($$1482661>>>0);
       if ($134) {
        break;
       } else {
        $$0488655 = $$0488;$$0497654 = $132;
       }
      }
      $135 = ($132|0)==(0);
      if ($135) {
       $$2483$ph = $$1482661;
      } else {
       $136 = ((($$1482661)) + -4|0);
       HEAP32[$136>>2] = $132;
       $$2483$ph = $136;
      }
     }
     $$2500 = $$1499660;
     while(1) {
      $137 = ($$2500>>>0)>($$2483$ph>>>0);
      if (!($137)) {
       break;
      }
      $138 = ((($$2500)) + -4|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0);
      if ($140) {
       $$2500 = $138;
      } else {
       break;
      }
     }
     $141 = HEAP32[$7>>2]|0;
     $142 = (($141) - ($123))|0;
     HEAP32[$7>>2] = $142;
     $143 = ($142|0)>(0);
     if ($143) {
      $$1482661 = $$2483$ph;$$1499660 = $$2500;$122 = $142;
     } else {
      $$1482$lcssa = $$2483$ph;$$1499$lcssa = $$2500;$$pr564 = $142;
      break;
     }
    }
   } else {
    $$1482$lcssa = $$556;$$1499$lcssa = $115;$$pr564 = $$pr;
   }
   $144 = ($$pr564|0)<(0);
   if ($144) {
    $145 = (($$539) + 25)|0;
    $146 = (($145|0) / 9)&-1;
    $147 = (($146) + 1)|0;
    $148 = ($40|0)==(102);
    $$3484648 = $$1482$lcssa;$$3501647 = $$1499$lcssa;$150 = $$pr564;
    while(1) {
     $149 = (0 - ($150))|0;
     $151 = ($149|0)<(9);
     $152 = $151 ? $149 : 9;
     $153 = ($$3484648>>>0)<($$3501647>>>0);
     if ($153) {
      $157 = 1 << $152;
      $158 = (($157) + -1)|0;
      $159 = 1000000000 >>> $152;
      $$0487642 = 0;$$1489641 = $$3484648;
      while(1) {
       $160 = HEAP32[$$1489641>>2]|0;
       $161 = $160 & $158;
       $162 = $160 >>> $152;
       $163 = (($162) + ($$0487642))|0;
       HEAP32[$$1489641>>2] = $163;
       $164 = Math_imul($161, $159)|0;
       $165 = ((($$1489641)) + 4|0);
       $166 = ($165>>>0)<($$3501647>>>0);
       if ($166) {
        $$0487642 = $164;$$1489641 = $165;
       } else {
        break;
       }
      }
      $167 = HEAP32[$$3484648>>2]|0;
      $168 = ($167|0)==(0);
      $169 = ((($$3484648)) + 4|0);
      $$$3484 = $168 ? $169 : $$3484648;
      $170 = ($164|0)==(0);
      if ($170) {
       $$$3484692 = $$$3484;$$4502 = $$3501647;
      } else {
       $171 = ((($$3501647)) + 4|0);
       HEAP32[$$3501647>>2] = $164;
       $$$3484692 = $$$3484;$$4502 = $171;
      }
     } else {
      $154 = HEAP32[$$3484648>>2]|0;
      $155 = ($154|0)==(0);
      $156 = ((($$3484648)) + 4|0);
      $$$3484691 = $155 ? $156 : $$3484648;
      $$$3484692 = $$$3484691;$$4502 = $$3501647;
     }
     $172 = $148 ? $$556 : $$$3484692;
     $173 = $$4502;
     $174 = $172;
     $175 = (($173) - ($174))|0;
     $176 = $175 >> 2;
     $177 = ($176|0)>($147|0);
     $178 = (($172) + ($147<<2)|0);
     $$$4502 = $177 ? $178 : $$4502;
     $179 = HEAP32[$7>>2]|0;
     $180 = (($179) + ($152))|0;
     HEAP32[$7>>2] = $180;
     $181 = ($180|0)<(0);
     if ($181) {
      $$3484648 = $$$3484692;$$3501647 = $$$4502;$150 = $180;
     } else {
      $$3484$lcssa = $$$3484692;$$3501$lcssa = $$$4502;
      break;
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa;$$3501$lcssa = $$1499$lcssa;
   }
   $182 = ($$3484$lcssa>>>0)<($$3501$lcssa>>>0);
   $183 = $$556;
   if ($182) {
    $184 = $$3484$lcssa;
    $185 = (($183) - ($184))|0;
    $186 = $185 >> 2;
    $187 = ($186*9)|0;
    $188 = HEAP32[$$3484$lcssa>>2]|0;
    $189 = ($188>>>0)<(10);
    if ($189) {
     $$1515 = $187;
    } else {
     $$0514637 = $187;$$0530636 = 10;
     while(1) {
      $190 = ($$0530636*10)|0;
      $191 = (($$0514637) + 1)|0;
      $192 = ($188>>>0)<($190>>>0);
      if ($192) {
       $$1515 = $191;
       break;
      } else {
       $$0514637 = $191;$$0530636 = $190;
      }
     }
    }
   } else {
    $$1515 = 0;
   }
   $193 = ($40|0)!=(102);
   $194 = $193 ? $$1515 : 0;
   $195 = (($$539) - ($194))|0;
   $196 = ($40|0)==(103);
   $197 = ($$539|0)!=(0);
   $198 = $197 & $196;
   $$neg = $198 << 31 >> 31;
   $199 = (($195) + ($$neg))|0;
   $200 = $$3501$lcssa;
   $201 = (($200) - ($183))|0;
   $202 = $201 >> 2;
   $203 = ($202*9)|0;
   $204 = (($203) + -9)|0;
   $205 = ($199|0)<($204|0);
   if ($205) {
    $206 = ((($$556)) + 4|0);
    $207 = (($199) + 9216)|0;
    $208 = (($207|0) / 9)&-1;
    $209 = (($208) + -1024)|0;
    $210 = (($206) + ($209<<2)|0);
    $211 = (($207|0) % 9)&-1;
    $$0527629 = (($211) + 1)|0;
    $212 = ($$0527629|0)<(9);
    if ($212) {
     $$0527631 = $$0527629;$$1531630 = 10;
     while(1) {
      $213 = ($$1531630*10)|0;
      $$0527 = (($$0527631) + 1)|0;
      $exitcond = ($$0527|0)==(9);
      if ($exitcond) {
       $$1531$lcssa = $213;
       break;
      } else {
       $$0527631 = $$0527;$$1531630 = $213;
      }
     }
    } else {
     $$1531$lcssa = 10;
    }
    $214 = HEAP32[$210>>2]|0;
    $215 = (($214>>>0) % ($$1531$lcssa>>>0))&-1;
    $216 = ($215|0)==(0);
    $217 = ((($210)) + 4|0);
    $218 = ($217|0)==($$3501$lcssa|0);
    $or$cond541 = $218 & $216;
    if ($or$cond541) {
     $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
    } else {
     $219 = (($214>>>0) / ($$1531$lcssa>>>0))&-1;
     $220 = $219 & 1;
     $221 = ($220|0)==(0);
     $$542 = $221 ? 9007199254740992.0 : 9007199254740994.0;
     $222 = (($$1531$lcssa|0) / 2)&-1;
     $223 = ($215>>>0)<($222>>>0);
     $224 = ($215|0)==($222|0);
     $or$cond544 = $218 & $224;
     $$559 = $or$cond544 ? 1.0 : 1.5;
     $$$559 = $223 ? 0.5 : $$559;
     $225 = ($$0520|0)==(0);
     if ($225) {
      $$1467 = $$$559;$$1469 = $$542;
     } else {
      $226 = HEAP8[$$0521>>0]|0;
      $227 = ($226<<24>>24)==(45);
      $228 = -$$542;
      $229 = -$$$559;
      $$$542 = $227 ? $228 : $$542;
      $$$$559 = $227 ? $229 : $$$559;
      $$1467 = $$$$559;$$1469 = $$$542;
     }
     $230 = (($214) - ($215))|0;
     HEAP32[$210>>2] = $230;
     $231 = $$1469 + $$1467;
     $232 = $231 != $$1469;
     if ($232) {
      $233 = (($230) + ($$1531$lcssa))|0;
      HEAP32[$210>>2] = $233;
      $234 = ($233>>>0)>(999999999);
      if ($234) {
       $$5486623 = $$3484$lcssa;$$sink545622 = $210;
       while(1) {
        $235 = ((($$sink545622)) + -4|0);
        HEAP32[$$sink545622>>2] = 0;
        $236 = ($235>>>0)<($$5486623>>>0);
        if ($236) {
         $237 = ((($$5486623)) + -4|0);
         HEAP32[$237>>2] = 0;
         $$6 = $237;
        } else {
         $$6 = $$5486623;
        }
        $238 = HEAP32[$235>>2]|0;
        $239 = (($238) + 1)|0;
        HEAP32[$235>>2] = $239;
        $240 = ($239>>>0)>(999999999);
        if ($240) {
         $$5486623 = $$6;$$sink545622 = $235;
        } else {
         $$5486$lcssa = $$6;$$sink545$lcssa = $235;
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa;$$sink545$lcssa = $210;
      }
      $241 = $$5486$lcssa;
      $242 = (($183) - ($241))|0;
      $243 = $242 >> 2;
      $244 = ($243*9)|0;
      $245 = HEAP32[$$5486$lcssa>>2]|0;
      $246 = ($245>>>0)<(10);
      if ($246) {
       $$4492 = $$sink545$lcssa;$$4518 = $244;$$8 = $$5486$lcssa;
      } else {
       $$2516618 = $244;$$2532617 = 10;
       while(1) {
        $247 = ($$2532617*10)|0;
        $248 = (($$2516618) + 1)|0;
        $249 = ($245>>>0)<($247>>>0);
        if ($249) {
         $$4492 = $$sink545$lcssa;$$4518 = $248;$$8 = $$5486$lcssa;
         break;
        } else {
         $$2516618 = $248;$$2532617 = $247;
        }
       }
      }
     } else {
      $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
     }
    }
    $250 = ((($$4492)) + 4|0);
    $251 = ($$3501$lcssa>>>0)>($250>>>0);
    $$$3501 = $251 ? $250 : $$3501$lcssa;
    $$5519$ph = $$4518;$$7505$ph = $$$3501;$$9$ph = $$8;
   } else {
    $$5519$ph = $$1515;$$7505$ph = $$3501$lcssa;$$9$ph = $$3484$lcssa;
   }
   $$7505 = $$7505$ph;
   while(1) {
    $252 = ($$7505>>>0)>($$9$ph>>>0);
    if (!($252)) {
     $$lcssa673 = 0;
     break;
    }
    $253 = ((($$7505)) + -4|0);
    $254 = HEAP32[$253>>2]|0;
    $255 = ($254|0)==(0);
    if ($255) {
     $$7505 = $253;
    } else {
     $$lcssa673 = 1;
     break;
    }
   }
   $256 = (0 - ($$5519$ph))|0;
   do {
    if ($196) {
     $not$ = $197 ^ 1;
     $257 = $not$&1;
     $$539$ = (($257) + ($$539))|0;
     $258 = ($$539$|0)>($$5519$ph|0);
     $259 = ($$5519$ph|0)>(-5);
     $or$cond6 = $258 & $259;
     if ($or$cond6) {
      $260 = (($5) + -1)|0;
      $$neg567 = (($$539$) + -1)|0;
      $261 = (($$neg567) - ($$5519$ph))|0;
      $$0479 = $260;$$2476 = $261;
     } else {
      $262 = (($5) + -2)|0;
      $263 = (($$539$) + -1)|0;
      $$0479 = $262;$$2476 = $263;
     }
     $264 = $4 & 8;
     $265 = ($264|0)==(0);
     if ($265) {
      if ($$lcssa673) {
       $266 = ((($$7505)) + -4|0);
       $267 = HEAP32[$266>>2]|0;
       $268 = ($267|0)==(0);
       if ($268) {
        $$2529 = 9;
       } else {
        $269 = (($267>>>0) % 10)&-1;
        $270 = ($269|0)==(0);
        if ($270) {
         $$1528614 = 0;$$3533613 = 10;
         while(1) {
          $271 = ($$3533613*10)|0;
          $272 = (($$1528614) + 1)|0;
          $273 = (($267>>>0) % ($271>>>0))&-1;
          $274 = ($273|0)==(0);
          if ($274) {
           $$1528614 = $272;$$3533613 = $271;
          } else {
           $$2529 = $272;
           break;
          }
         }
        } else {
         $$2529 = 0;
        }
       }
      } else {
       $$2529 = 9;
      }
      $275 = $$0479 | 32;
      $276 = ($275|0)==(102);
      $277 = $$7505;
      $278 = (($277) - ($183))|0;
      $279 = $278 >> 2;
      $280 = ($279*9)|0;
      $281 = (($280) + -9)|0;
      if ($276) {
       $282 = (($281) - ($$2529))|0;
       $283 = ($282|0)>(0);
       $$546 = $283 ? $282 : 0;
       $284 = ($$2476|0)<($$546|0);
       $$2476$$547 = $284 ? $$2476 : $$546;
       $$1480 = $$0479;$$3477 = $$2476$$547;$$pre$phi690Z2D = 0;
       break;
      } else {
       $285 = (($281) + ($$5519$ph))|0;
       $286 = (($285) - ($$2529))|0;
       $287 = ($286|0)>(0);
       $$548 = $287 ? $286 : 0;
       $288 = ($$2476|0)<($$548|0);
       $$2476$$549 = $288 ? $$2476 : $$548;
       $$1480 = $$0479;$$3477 = $$2476$$549;$$pre$phi690Z2D = 0;
       break;
      }
     } else {
      $$1480 = $$0479;$$3477 = $$2476;$$pre$phi690Z2D = $264;
     }
    } else {
     $$pre689 = $4 & 8;
     $$1480 = $5;$$3477 = $$539;$$pre$phi690Z2D = $$pre689;
    }
   } while(0);
   $289 = $$3477 | $$pre$phi690Z2D;
   $290 = ($289|0)!=(0);
   $291 = $290&1;
   $292 = $$1480 | 32;
   $293 = ($292|0)==(102);
   if ($293) {
    $294 = ($$5519$ph|0)>(0);
    $295 = $294 ? $$5519$ph : 0;
    $$2513 = 0;$$pn566 = $295;
   } else {
    $296 = ($$5519$ph|0)<(0);
    $297 = $296 ? $256 : $$5519$ph;
    $298 = ($297|0)<(0);
    $299 = $298 << 31 >> 31;
    $300 = (_fmt_u($297,$299,$11)|0);
    $301 = $11;
    $302 = $300;
    $303 = (($301) - ($302))|0;
    $304 = ($303|0)<(2);
    if ($304) {
     $$1512607 = $300;
     while(1) {
      $305 = ((($$1512607)) + -1|0);
      HEAP8[$305>>0] = 48;
      $306 = $305;
      $307 = (($301) - ($306))|0;
      $308 = ($307|0)<(2);
      if ($308) {
       $$1512607 = $305;
      } else {
       $$1512$lcssa = $305;
       break;
      }
     }
    } else {
     $$1512$lcssa = $300;
    }
    $309 = $$5519$ph >> 31;
    $310 = $309 & 2;
    $311 = (($310) + 43)|0;
    $312 = $311&255;
    $313 = ((($$1512$lcssa)) + -1|0);
    HEAP8[$313>>0] = $312;
    $314 = $$1480&255;
    $315 = ((($$1512$lcssa)) + -2|0);
    HEAP8[$315>>0] = $314;
    $316 = $315;
    $317 = (($301) - ($316))|0;
    $$2513 = $315;$$pn566 = $317;
   }
   $318 = (($$0520) + 1)|0;
   $319 = (($318) + ($$3477))|0;
   $$1526 = (($319) + ($291))|0;
   $320 = (($$1526) + ($$pn566))|0;
   _pad_684($0,32,$2,$320,$4);
   _out($0,$$0521,$$0520);
   $321 = $4 ^ 65536;
   _pad_684($0,48,$2,$320,$321);
   if ($293) {
    $322 = ($$9$ph>>>0)>($$556>>>0);
    $$0496$$9 = $322 ? $$556 : $$9$ph;
    $323 = ((($8)) + 9|0);
    $324 = $323;
    $325 = ((($8)) + 8|0);
    $$5493597 = $$0496$$9;
    while(1) {
     $326 = HEAP32[$$5493597>>2]|0;
     $327 = (_fmt_u($326,0,$323)|0);
     $328 = ($$5493597|0)==($$0496$$9|0);
     if ($328) {
      $334 = ($327|0)==($323|0);
      if ($334) {
       HEAP8[$325>>0] = 48;
       $$1465 = $325;
      } else {
       $$1465 = $327;
      }
     } else {
      $329 = ($327>>>0)>($8>>>0);
      if ($329) {
       $330 = $327;
       $331 = (($330) - ($9))|0;
       _memset(($8|0),48,($331|0))|0;
       $$0464594 = $327;
       while(1) {
        $332 = ((($$0464594)) + -1|0);
        $333 = ($332>>>0)>($8>>>0);
        if ($333) {
         $$0464594 = $332;
        } else {
         $$1465 = $332;
         break;
        }
       }
      } else {
       $$1465 = $327;
      }
     }
     $335 = $$1465;
     $336 = (($324) - ($335))|0;
     _out($0,$$1465,$336);
     $337 = ((($$5493597)) + 4|0);
     $338 = ($337>>>0)>($$556>>>0);
     if ($338) {
      break;
     } else {
      $$5493597 = $337;
     }
    }
    $339 = ($289|0)==(0);
    if (!($339)) {
     _out($0,4386,1);
    }
    $340 = ($337>>>0)<($$7505>>>0);
    $341 = ($$3477|0)>(0);
    $342 = $340 & $341;
    if ($342) {
     $$4478590 = $$3477;$$6494589 = $337;
     while(1) {
      $343 = HEAP32[$$6494589>>2]|0;
      $344 = (_fmt_u($343,0,$323)|0);
      $345 = ($344>>>0)>($8>>>0);
      if ($345) {
       $346 = $344;
       $347 = (($346) - ($9))|0;
       _memset(($8|0),48,($347|0))|0;
       $$0463584 = $344;
       while(1) {
        $348 = ((($$0463584)) + -1|0);
        $349 = ($348>>>0)>($8>>>0);
        if ($349) {
         $$0463584 = $348;
        } else {
         $$0463$lcssa = $348;
         break;
        }
       }
      } else {
       $$0463$lcssa = $344;
      }
      $350 = ($$4478590|0)<(9);
      $351 = $350 ? $$4478590 : 9;
      _out($0,$$0463$lcssa,$351);
      $352 = ((($$6494589)) + 4|0);
      $353 = (($$4478590) + -9)|0;
      $354 = ($352>>>0)<($$7505>>>0);
      $355 = ($$4478590|0)>(9);
      $356 = $354 & $355;
      if ($356) {
       $$4478590 = $353;$$6494589 = $352;
      } else {
       $$4478$lcssa = $353;
       break;
      }
     }
    } else {
     $$4478$lcssa = $$3477;
    }
    $357 = (($$4478$lcssa) + 9)|0;
    _pad_684($0,48,$357,9,0);
   } else {
    $358 = ((($$9$ph)) + 4|0);
    $$7505$ = $$lcssa673 ? $$7505 : $358;
    $359 = ($$3477|0)>(-1);
    if ($359) {
     $360 = ((($8)) + 9|0);
     $361 = ($$pre$phi690Z2D|0)==(0);
     $362 = $360;
     $363 = (0 - ($9))|0;
     $364 = ((($8)) + 8|0);
     $$5602 = $$3477;$$7495601 = $$9$ph;
     while(1) {
      $365 = HEAP32[$$7495601>>2]|0;
      $366 = (_fmt_u($365,0,$360)|0);
      $367 = ($366|0)==($360|0);
      if ($367) {
       HEAP8[$364>>0] = 48;
       $$0 = $364;
      } else {
       $$0 = $366;
      }
      $368 = ($$7495601|0)==($$9$ph|0);
      do {
       if ($368) {
        $372 = ((($$0)) + 1|0);
        _out($0,$$0,1);
        $373 = ($$5602|0)<(1);
        $or$cond554 = $361 & $373;
        if ($or$cond554) {
         $$2 = $372;
         break;
        }
        _out($0,4386,1);
        $$2 = $372;
       } else {
        $369 = ($$0>>>0)>($8>>>0);
        if (!($369)) {
         $$2 = $$0;
         break;
        }
        $scevgep684 = (($$0) + ($363)|0);
        $scevgep684685 = $scevgep684;
        _memset(($8|0),48,($scevgep684685|0))|0;
        $$1598 = $$0;
        while(1) {
         $370 = ((($$1598)) + -1|0);
         $371 = ($370>>>0)>($8>>>0);
         if ($371) {
          $$1598 = $370;
         } else {
          $$2 = $370;
          break;
         }
        }
       }
      } while(0);
      $374 = $$2;
      $375 = (($362) - ($374))|0;
      $376 = ($$5602|0)>($375|0);
      $377 = $376 ? $375 : $$5602;
      _out($0,$$2,$377);
      $378 = (($$5602) - ($375))|0;
      $379 = ((($$7495601)) + 4|0);
      $380 = ($379>>>0)<($$7505$>>>0);
      $381 = ($378|0)>(-1);
      $382 = $380 & $381;
      if ($382) {
       $$5602 = $378;$$7495601 = $379;
      } else {
       $$5$lcssa = $378;
       break;
      }
     }
    } else {
     $$5$lcssa = $$3477;
    }
    $383 = (($$5$lcssa) + 18)|0;
    _pad_684($0,48,$383,18,0);
    $384 = $11;
    $385 = $$2513;
    $386 = (($384) - ($385))|0;
    _out($0,$$2513,$386);
   }
   $387 = $4 ^ 8192;
   _pad_684($0,32,$2,$320,$387);
   $$sink562 = $320;
  } else {
   $27 = $5 & 32;
   $28 = ($27|0)!=(0);
   $29 = $28 ? 4354 : 4358;
   $30 = ($$0471 != $$0471) | (0.0 != 0.0);
   $31 = $28 ? 4362 : 4366;
   $$0510 = $30 ? $31 : $29;
   $32 = (($$0520) + 3)|0;
   $33 = $4 & -65537;
   _pad_684($0,32,$2,$32,$33);
   _out($0,$$0521,$$0520);
   _out($0,$$0510,3);
   $34 = $4 ^ 8192;
   _pad_684($0,32,$2,$32,$34);
   $$sink562 = $32;
  }
 } while(0);
 $388 = ($$sink562|0)<($2|0);
 $$555 = $388 ? $2 : $$sink562;
 STACKTOP = sp;return ($$555|0);
}
function ___DOUBLE_BITS_685($0) {
 $0 = +$0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$1 = HEAP32[tempDoublePtr>>2]|0;
 $2 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($2);
 return ($1|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $not$ = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = (___pthread_self_431()|0);
   $7 = ((($6)) + 188|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = HEAP32[$8>>2]|0;
   $not$ = ($9|0)==(0|0);
   if ($not$) {
    $10 = $1 & -128;
    $11 = ($10|0)==(57216);
    if ($11) {
     $13 = $1&255;
     HEAP8[$0>>0] = $13;
     $$0 = 1;
     break;
    } else {
     $12 = (___errno_location()|0);
     HEAP32[$12>>2] = 84;
     $$0 = -1;
     break;
    }
   }
   $14 = ($1>>>0)<(2048);
   if ($14) {
    $15 = $1 >>> 6;
    $16 = $15 | 192;
    $17 = $16&255;
    $18 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $17;
    $19 = $1 & 63;
    $20 = $19 | 128;
    $21 = $20&255;
    HEAP8[$18>>0] = $21;
    $$0 = 2;
    break;
   }
   $22 = ($1>>>0)<(55296);
   $23 = $1 & -8192;
   $24 = ($23|0)==(57344);
   $or$cond = $22 | $24;
   if ($or$cond) {
    $25 = $1 >>> 12;
    $26 = $25 | 224;
    $27 = $26&255;
    $28 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $27;
    $29 = $1 >>> 6;
    $30 = $29 & 63;
    $31 = $30 | 128;
    $32 = $31&255;
    $33 = ((($0)) + 2|0);
    HEAP8[$28>>0] = $32;
    $34 = $1 & 63;
    $35 = $34 | 128;
    $36 = $35&255;
    HEAP8[$33>>0] = $36;
    $$0 = 3;
    break;
   }
   $37 = (($1) + -65536)|0;
   $38 = ($37>>>0)<(1048576);
   if ($38) {
    $39 = $1 >>> 18;
    $40 = $39 | 240;
    $41 = $40&255;
    $42 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $41;
    $43 = $1 >>> 12;
    $44 = $43 & 63;
    $45 = $44 | 128;
    $46 = $45&255;
    $47 = ((($0)) + 2|0);
    HEAP8[$42>>0] = $46;
    $48 = $1 >>> 6;
    $49 = $48 & 63;
    $50 = $49 | 128;
    $51 = $50&255;
    $52 = ((($0)) + 3|0);
    HEAP8[$47>>0] = $51;
    $53 = $1 & 63;
    $54 = $53 | 128;
    $55 = $54&255;
    HEAP8[$52>>0] = $55;
    $$0 = 4;
    break;
   } else {
    $56 = (___errno_location()|0);
    HEAP32[$56>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___pthread_self_431() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___pthread_self_104() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___strerror_l($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $$016 = 0;
 while(1) {
  $3 = (4388 + ($$016)|0);
  $4 = HEAP8[$3>>0]|0;
  $5 = $4&255;
  $6 = ($5|0)==($0|0);
  if ($6) {
   label = 2;
   break;
  }
  $7 = (($$016) + 1)|0;
  $8 = ($7|0)==(87);
  if ($8) {
   $$01214 = 4476;$$115 = 87;
   label = 5;
   break;
  } else {
   $$016 = $7;
  }
 }
 if ((label|0) == 2) {
  $2 = ($$016|0)==(0);
  if ($2) {
   $$012$lcssa = 4476;
  } else {
   $$01214 = 4476;$$115 = $$016;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $$113 = $$01214;
   while(1) {
    $9 = HEAP8[$$113>>0]|0;
    $10 = ($9<<24>>24)==(0);
    $11 = ((($$113)) + 1|0);
    if ($10) {
     break;
    } else {
     $$113 = $11;
    }
   }
   $12 = (($$115) + -1)|0;
   $13 = ($12|0)==(0);
   if ($13) {
    $$012$lcssa = $11;
    break;
   } else {
    $$01214 = $11;$$115 = $12;
    label = 5;
   }
  }
 }
 $14 = ((($1)) + 20|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (___lctrans($$012$lcssa,$15)|0);
 return ($16|0);
}
function ___lctrans($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___lctrans_impl($0,$1)|0);
 return ($2|0);
}
function ___lctrans_impl($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = HEAP32[$1>>2]|0;
  $4 = ((($1)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (___mo_lookup($3,$5,$0)|0);
  $$0 = $6;
 }
 $7 = ($$0|0)!=(0|0);
 $8 = $7 ? $$0 : $0;
 return ($8|0);
}
function ___mo_lookup($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$090 = 0, $$094 = 0, $$191 = 0, $$195 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond102 = 0, $or$cond104 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = (($3) + 1794895138)|0;
 $5 = ((($0)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (_swapc($6,$4)|0);
 $8 = ((($0)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (_swapc($9,$4)|0);
 $11 = ((($0)) + 16|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (_swapc($12,$4)|0);
 $14 = $1 >>> 2;
 $15 = ($7>>>0)<($14>>>0);
 L1: do {
  if ($15) {
   $16 = $7 << 2;
   $17 = (($1) - ($16))|0;
   $18 = ($10>>>0)<($17>>>0);
   $19 = ($13>>>0)<($17>>>0);
   $or$cond = $18 & $19;
   if ($or$cond) {
    $20 = $13 | $10;
    $21 = $20 & 3;
    $22 = ($21|0)==(0);
    if ($22) {
     $23 = $10 >>> 2;
     $24 = $13 >>> 2;
     $$090 = 0;$$094 = $7;
     while(1) {
      $25 = $$094 >>> 1;
      $26 = (($$090) + ($25))|0;
      $27 = $26 << 1;
      $28 = (($27) + ($23))|0;
      $29 = (($0) + ($28<<2)|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (_swapc($30,$4)|0);
      $32 = (($28) + 1)|0;
      $33 = (($0) + ($32<<2)|0);
      $34 = HEAP32[$33>>2]|0;
      $35 = (_swapc($34,$4)|0);
      $36 = ($35>>>0)<($1>>>0);
      $37 = (($1) - ($35))|0;
      $38 = ($31>>>0)<($37>>>0);
      $or$cond102 = $36 & $38;
      if (!($or$cond102)) {
       $$4 = 0;
       break L1;
      }
      $39 = (($35) + ($31))|0;
      $40 = (($0) + ($39)|0);
      $41 = HEAP8[$40>>0]|0;
      $42 = ($41<<24>>24)==(0);
      if (!($42)) {
       $$4 = 0;
       break L1;
      }
      $43 = (($0) + ($35)|0);
      $44 = (_strcmp($2,$43)|0);
      $45 = ($44|0)==(0);
      if ($45) {
       break;
      }
      $62 = ($$094|0)==(1);
      $63 = ($44|0)<(0);
      $64 = (($$094) - ($25))|0;
      $$195 = $63 ? $25 : $64;
      $$191 = $63 ? $$090 : $26;
      if ($62) {
       $$4 = 0;
       break L1;
      } else {
       $$090 = $$191;$$094 = $$195;
      }
     }
     $46 = (($27) + ($24))|0;
     $47 = (($0) + ($46<<2)|0);
     $48 = HEAP32[$47>>2]|0;
     $49 = (_swapc($48,$4)|0);
     $50 = (($46) + 1)|0;
     $51 = (($0) + ($50<<2)|0);
     $52 = HEAP32[$51>>2]|0;
     $53 = (_swapc($52,$4)|0);
     $54 = ($53>>>0)<($1>>>0);
     $55 = (($1) - ($53))|0;
     $56 = ($49>>>0)<($55>>>0);
     $or$cond104 = $54 & $56;
     if ($or$cond104) {
      $57 = (($0) + ($53)|0);
      $58 = (($53) + ($49))|0;
      $59 = (($0) + ($58)|0);
      $60 = HEAP8[$59>>0]|0;
      $61 = ($60<<24>>24)==(0);
      $$ = $61 ? $57 : 0;
      $$4 = $$;
     } else {
      $$4 = 0;
     }
    } else {
     $$4 = 0;
    }
   } else {
    $$4 = 0;
   }
  } else {
   $$4 = 0;
  }
 } while(0);
 return ($$4|0);
}
function _swapc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0);
 $3 = (_llvm_bswap_i32(($0|0))|0);
 $$ = $2 ? $0 : $3;
 return ($$|0);
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$038 = 0, $$042 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $$pre = 0, $$pre47 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$1 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 31]($2,$0,$1)|0);
    $$1 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)>(-1);
   L10: do {
    if ($20) {
     $$038 = $1;
     while(1) {
      $21 = ($$038|0)==(0);
      if ($21) {
       $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
       break L10;
      }
      $22 = (($$038) + -1)|0;
      $23 = (($0) + ($22)|0);
      $24 = HEAP8[$23>>0]|0;
      $25 = ($24<<24>>24)==(10);
      if ($25) {
       break;
      } else {
       $$038 = $22;
      }
     }
     $26 = ((($2)) + 36|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = (FUNCTION_TABLE_iiii[$27 & 31]($2,$0,$$038)|0);
     $29 = ($28>>>0)<($$038>>>0);
     if ($29) {
      $$1 = $28;
      break L5;
     }
     $30 = (($0) + ($$038)|0);
     $$042 = (($1) - ($$038))|0;
     $$pre47 = HEAP32[$9>>2]|0;
     $$139 = $$038;$$141 = $30;$$143 = $$042;$31 = $$pre47;
    } else {
     $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
    }
   } while(0);
   _memcpy(($31|0),($$141|0),($$143|0))|0;
   $32 = HEAP32[$9>>2]|0;
   $33 = (($32) + ($$143)|0);
   HEAP32[$9>>2] = $33;
   $34 = (($$139) + ($$143))|0;
   $$1 = $34;
  }
 } while(0);
 return ($$1|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = ((($0)) + 48|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (($14) + ($18)|0);
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = $19;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((6404|0));
 return (6412|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((6404|0));
 return;
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $8 = HEAP32[99]|0;
   $9 = ($8|0)==(0|0);
   if ($9) {
    $29 = 0;
   } else {
    $10 = HEAP32[99]|0;
    $11 = (_fflush($10)|0);
    $29 = $11;
   }
   $12 = (___ofl_lock()|0);
   $$02325 = HEAP32[$12>>2]|0;
   $13 = ($$02325|0)==(0|0);
   if ($13) {
    $$024$lcssa = $29;
   } else {
    $$02327 = $$02325;$$02426 = $29;
    while(1) {
     $14 = ((($$02327)) + 76|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)>(-1);
     if ($16) {
      $17 = (___lockfile($$02327)|0);
      $26 = $17;
     } else {
      $26 = 0;
     }
     $18 = ((($$02327)) + 20|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ((($$02327)) + 28|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($19>>>0)>($21>>>0);
     if ($22) {
      $23 = (___fflush_unlocked($$02327)|0);
      $24 = $23 | $$02426;
      $$1 = $24;
     } else {
      $$1 = $$02426;
     }
     $25 = ($26|0)==(0);
     if (!($25)) {
      ___unlockfile($$02327);
     }
     $27 = ((($$02327)) + 56|0);
     $$023 = HEAP32[$27>>2]|0;
     $28 = ($$023|0)==(0|0);
     if ($28) {
      $$024$lcssa = $$1;
      break;
     } else {
      $$02327 = $$023;$$02426 = $$1;
     }
    }
   }
   ___ofl_unlock();
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $5 = (___fflush_unlocked($0)|0);
    $$0 = $5;
    break;
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $7 = (___fflush_unlocked($0)|0);
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 if ($5) {
  $6 = ((($0)) + 36|0);
  $7 = HEAP32[$6>>2]|0;
  (FUNCTION_TABLE_iiii[$7 & 31]($0,0,0)|0);
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)==(0|0);
  if ($9) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $10 = ((($0)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($11>>>0)<($13>>>0);
  if ($14) {
   $15 = $11;
   $16 = $13;
   $17 = (($15) - ($16))|0;
   $18 = ((($0)) + 40|0);
   $19 = HEAP32[$18>>2]|0;
   (FUNCTION_TABLE_iiii[$19 & 31]($0,$17,1)|0);
  }
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$12>>2] = 0;
  HEAP32[$10>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _printf($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[67]|0;
 $3 = (_vfprintf($2,$0,$1)|0);
 STACKTOP = sp;return ($3|0);
}
function _malloc($0) {
 $0 = $0|0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4236$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i18$i = 0, $$01$i$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01928$i = 0, $$0193$lcssa$i = 0, $$01937$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0;
 var $$0212$i$i = 0, $$024371$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0;
 var $$124470$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234253237$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i201 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$415$i = 0;
 var $$4236$i = 0, $$4351$lcssa$i = 0, $$435114$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435713$i = 0, $$723948$i = 0, $$749$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i19$i = 0, $$pre$i210 = 0, $$pre$i212 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i20$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0;
 var $$pre10$i$i = 0, $$sink1$i = 0, $$sink1$i$i = 0, $$sink16$i = 0, $$sink2$i = 0, $$sink2$i204 = 0, $$sink3$i = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0;
 var $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0;
 var $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0;
 var $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0;
 var $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0;
 var $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0;
 var $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0;
 var $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0;
 var $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0;
 var $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0;
 var $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0;
 var $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0;
 var $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0;
 var $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0;
 var $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0;
 var $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0;
 var $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0;
 var $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0;
 var $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0;
 var $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0;
 var $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0;
 var $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0;
 var $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0;
 var $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0;
 var $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0;
 var $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0;
 var $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0;
 var $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0;
 var $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0;
 var $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0;
 var $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0;
 var $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0;
 var $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0;
 var $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0;
 var $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0;
 var $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0;
 var $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0;
 var $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0;
 var $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0;
 var $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0;
 var $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0;
 var $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0;
 var $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0;
 var $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0;
 var $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0;
 var $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0;
 var $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0;
 var $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0;
 var $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0;
 var $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0;
 var $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0;
 var $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0;
 var $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0;
 var $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i208 = 0, $exitcond$i$i = 0, $not$$i = 0, $not$$i$i = 0, $not$$i17$i = 0, $not$$i209 = 0, $not$$i216 = 0, $not$1$i = 0, $not$1$i203 = 0, $not$5$i = 0, $not$7$i$i = 0, $not$8$i = 0, $not$9$i = 0;
 var $or$cond$i = 0, $or$cond$i214 = 0, $or$cond1$i = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond11$not$i = 0, $or$cond12$i = 0, $or$cond2$i = 0, $or$cond2$i215 = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond51$i = 0, $or$cond7$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[1604]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (6456 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($16|0)==($20|0);
    do {
     if ($21) {
      $22 = 1 << $14;
      $23 = $22 ^ -1;
      $24 = $8 & $23;
      HEAP32[1604] = $24;
     } else {
      $25 = HEAP32[(6432)>>2]|0;
      $26 = ($20>>>0)<($25>>>0);
      if ($26) {
       _abort();
       // unreachable;
      }
      $27 = ((($20)) + 12|0);
      $28 = HEAP32[$27>>2]|0;
      $29 = ($28|0)==($18|0);
      if ($29) {
       HEAP32[$27>>2] = $16;
       HEAP32[$17>>2] = $20;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $30 = $14 << 3;
    $31 = $30 | 3;
    $32 = ((($18)) + 4|0);
    HEAP32[$32>>2] = $31;
    $33 = (($18) + ($30)|0);
    $34 = ((($33)) + 4|0);
    $35 = HEAP32[$34>>2]|0;
    $36 = $35 | 1;
    HEAP32[$34>>2] = $36;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $37 = HEAP32[(6424)>>2]|0;
   $38 = ($6>>>0)>($37>>>0);
   if ($38) {
    $39 = ($9|0)==(0);
    if (!($39)) {
     $40 = $9 << $7;
     $41 = 2 << $7;
     $42 = (0 - ($41))|0;
     $43 = $41 | $42;
     $44 = $40 & $43;
     $45 = (0 - ($44))|0;
     $46 = $44 & $45;
     $47 = (($46) + -1)|0;
     $48 = $47 >>> 12;
     $49 = $48 & 16;
     $50 = $47 >>> $49;
     $51 = $50 >>> 5;
     $52 = $51 & 8;
     $53 = $52 | $49;
     $54 = $50 >>> $52;
     $55 = $54 >>> 2;
     $56 = $55 & 4;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 2;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = $62 >>> 1;
     $64 = $63 & 1;
     $65 = $61 | $64;
     $66 = $62 >>> $64;
     $67 = (($65) + ($66))|0;
     $68 = $67 << 1;
     $69 = (6456 + ($68<<2)|0);
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ((($71)) + 8|0);
     $73 = HEAP32[$72>>2]|0;
     $74 = ($69|0)==($73|0);
     do {
      if ($74) {
       $75 = 1 << $67;
       $76 = $75 ^ -1;
       $77 = $8 & $76;
       HEAP32[1604] = $77;
       $98 = $77;
      } else {
       $78 = HEAP32[(6432)>>2]|0;
       $79 = ($73>>>0)<($78>>>0);
       if ($79) {
        _abort();
        // unreachable;
       }
       $80 = ((($73)) + 12|0);
       $81 = HEAP32[$80>>2]|0;
       $82 = ($81|0)==($71|0);
       if ($82) {
        HEAP32[$80>>2] = $69;
        HEAP32[$70>>2] = $73;
        $98 = $8;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $83 = $67 << 3;
     $84 = (($83) - ($6))|0;
     $85 = $6 | 3;
     $86 = ((($71)) + 4|0);
     HEAP32[$86>>2] = $85;
     $87 = (($71) + ($6)|0);
     $88 = $84 | 1;
     $89 = ((($87)) + 4|0);
     HEAP32[$89>>2] = $88;
     $90 = (($87) + ($84)|0);
     HEAP32[$90>>2] = $84;
     $91 = ($37|0)==(0);
     if (!($91)) {
      $92 = HEAP32[(6436)>>2]|0;
      $93 = $37 >>> 3;
      $94 = $93 << 1;
      $95 = (6456 + ($94<<2)|0);
      $96 = 1 << $93;
      $97 = $98 & $96;
      $99 = ($97|0)==(0);
      if ($99) {
       $100 = $98 | $96;
       HEAP32[1604] = $100;
       $$pre = ((($95)) + 8|0);
       $$0199 = $95;$$pre$phiZ2D = $$pre;
      } else {
       $101 = ((($95)) + 8|0);
       $102 = HEAP32[$101>>2]|0;
       $103 = HEAP32[(6432)>>2]|0;
       $104 = ($102>>>0)<($103>>>0);
       if ($104) {
        _abort();
        // unreachable;
       } else {
        $$0199 = $102;$$pre$phiZ2D = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $92;
      $105 = ((($$0199)) + 12|0);
      HEAP32[$105>>2] = $92;
      $106 = ((($92)) + 8|0);
      HEAP32[$106>>2] = $$0199;
      $107 = ((($92)) + 12|0);
      HEAP32[$107>>2] = $95;
     }
     HEAP32[(6424)>>2] = $84;
     HEAP32[(6436)>>2] = $87;
     $$0 = $72;
     STACKTOP = sp;return ($$0|0);
    }
    $108 = HEAP32[(6420)>>2]|0;
    $109 = ($108|0)==(0);
    if ($109) {
     $$0197 = $6;
    } else {
     $110 = (0 - ($108))|0;
     $111 = $108 & $110;
     $112 = (($111) + -1)|0;
     $113 = $112 >>> 12;
     $114 = $113 & 16;
     $115 = $112 >>> $114;
     $116 = $115 >>> 5;
     $117 = $116 & 8;
     $118 = $117 | $114;
     $119 = $115 >>> $117;
     $120 = $119 >>> 2;
     $121 = $120 & 4;
     $122 = $118 | $121;
     $123 = $119 >>> $121;
     $124 = $123 >>> 1;
     $125 = $124 & 2;
     $126 = $122 | $125;
     $127 = $123 >>> $125;
     $128 = $127 >>> 1;
     $129 = $128 & 1;
     $130 = $126 | $129;
     $131 = $127 >>> $129;
     $132 = (($130) + ($131))|0;
     $133 = (6720 + ($132<<2)|0);
     $134 = HEAP32[$133>>2]|0;
     $135 = ((($134)) + 4|0);
     $136 = HEAP32[$135>>2]|0;
     $137 = $136 & -8;
     $138 = (($137) - ($6))|0;
     $139 = ((($134)) + 16|0);
     $140 = HEAP32[$139>>2]|0;
     $not$5$i = ($140|0)==(0|0);
     $$sink16$i = $not$5$i&1;
     $141 = (((($134)) + 16|0) + ($$sink16$i<<2)|0);
     $142 = HEAP32[$141>>2]|0;
     $143 = ($142|0)==(0|0);
     if ($143) {
      $$0192$lcssa$i = $134;$$0193$lcssa$i = $138;
     } else {
      $$01928$i = $134;$$01937$i = $138;$145 = $142;
      while(1) {
       $144 = ((($145)) + 4|0);
       $146 = HEAP32[$144>>2]|0;
       $147 = $146 & -8;
       $148 = (($147) - ($6))|0;
       $149 = ($148>>>0)<($$01937$i>>>0);
       $$$0193$i = $149 ? $148 : $$01937$i;
       $$$0192$i = $149 ? $145 : $$01928$i;
       $150 = ((($145)) + 16|0);
       $151 = HEAP32[$150>>2]|0;
       $not$$i = ($151|0)==(0|0);
       $$sink1$i = $not$$i&1;
       $152 = (((($145)) + 16|0) + ($$sink1$i<<2)|0);
       $153 = HEAP32[$152>>2]|0;
       $154 = ($153|0)==(0|0);
       if ($154) {
        $$0192$lcssa$i = $$$0192$i;$$0193$lcssa$i = $$$0193$i;
        break;
       } else {
        $$01928$i = $$$0192$i;$$01937$i = $$$0193$i;$145 = $153;
       }
      }
     }
     $155 = HEAP32[(6432)>>2]|0;
     $156 = ($$0192$lcssa$i>>>0)<($155>>>0);
     if ($156) {
      _abort();
      // unreachable;
     }
     $157 = (($$0192$lcssa$i) + ($6)|0);
     $158 = ($$0192$lcssa$i>>>0)<($157>>>0);
     if (!($158)) {
      _abort();
      // unreachable;
     }
     $159 = ((($$0192$lcssa$i)) + 24|0);
     $160 = HEAP32[$159>>2]|0;
     $161 = ((($$0192$lcssa$i)) + 12|0);
     $162 = HEAP32[$161>>2]|0;
     $163 = ($162|0)==($$0192$lcssa$i|0);
     do {
      if ($163) {
       $173 = ((($$0192$lcssa$i)) + 20|0);
       $174 = HEAP32[$173>>2]|0;
       $175 = ($174|0)==(0|0);
       if ($175) {
        $176 = ((($$0192$lcssa$i)) + 16|0);
        $177 = HEAP32[$176>>2]|0;
        $178 = ($177|0)==(0|0);
        if ($178) {
         $$3$i = 0;
         break;
        } else {
         $$1196$i = $177;$$1198$i = $176;
        }
       } else {
        $$1196$i = $174;$$1198$i = $173;
       }
       while(1) {
        $179 = ((($$1196$i)) + 20|0);
        $180 = HEAP32[$179>>2]|0;
        $181 = ($180|0)==(0|0);
        if (!($181)) {
         $$1196$i = $180;$$1198$i = $179;
         continue;
        }
        $182 = ((($$1196$i)) + 16|0);
        $183 = HEAP32[$182>>2]|0;
        $184 = ($183|0)==(0|0);
        if ($184) {
         break;
        } else {
         $$1196$i = $183;$$1198$i = $182;
        }
       }
       $185 = ($$1198$i>>>0)<($155>>>0);
       if ($185) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$$1198$i>>2] = 0;
        $$3$i = $$1196$i;
        break;
       }
      } else {
       $164 = ((($$0192$lcssa$i)) + 8|0);
       $165 = HEAP32[$164>>2]|0;
       $166 = ($165>>>0)<($155>>>0);
       if ($166) {
        _abort();
        // unreachable;
       }
       $167 = ((($165)) + 12|0);
       $168 = HEAP32[$167>>2]|0;
       $169 = ($168|0)==($$0192$lcssa$i|0);
       if (!($169)) {
        _abort();
        // unreachable;
       }
       $170 = ((($162)) + 8|0);
       $171 = HEAP32[$170>>2]|0;
       $172 = ($171|0)==($$0192$lcssa$i|0);
       if ($172) {
        HEAP32[$167>>2] = $162;
        HEAP32[$170>>2] = $165;
        $$3$i = $162;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $186 = ($160|0)==(0|0);
     L73: do {
      if (!($186)) {
       $187 = ((($$0192$lcssa$i)) + 28|0);
       $188 = HEAP32[$187>>2]|0;
       $189 = (6720 + ($188<<2)|0);
       $190 = HEAP32[$189>>2]|0;
       $191 = ($$0192$lcssa$i|0)==($190|0);
       do {
        if ($191) {
         HEAP32[$189>>2] = $$3$i;
         $cond$i = ($$3$i|0)==(0|0);
         if ($cond$i) {
          $192 = 1 << $188;
          $193 = $192 ^ -1;
          $194 = $108 & $193;
          HEAP32[(6420)>>2] = $194;
          break L73;
         }
        } else {
         $195 = HEAP32[(6432)>>2]|0;
         $196 = ($160>>>0)<($195>>>0);
         if ($196) {
          _abort();
          // unreachable;
         } else {
          $197 = ((($160)) + 16|0);
          $198 = HEAP32[$197>>2]|0;
          $not$1$i = ($198|0)!=($$0192$lcssa$i|0);
          $$sink2$i = $not$1$i&1;
          $199 = (((($160)) + 16|0) + ($$sink2$i<<2)|0);
          HEAP32[$199>>2] = $$3$i;
          $200 = ($$3$i|0)==(0|0);
          if ($200) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while(0);
       $201 = HEAP32[(6432)>>2]|0;
       $202 = ($$3$i>>>0)<($201>>>0);
       if ($202) {
        _abort();
        // unreachable;
       }
       $203 = ((($$3$i)) + 24|0);
       HEAP32[$203>>2] = $160;
       $204 = ((($$0192$lcssa$i)) + 16|0);
       $205 = HEAP32[$204>>2]|0;
       $206 = ($205|0)==(0|0);
       do {
        if (!($206)) {
         $207 = ($205>>>0)<($201>>>0);
         if ($207) {
          _abort();
          // unreachable;
         } else {
          $208 = ((($$3$i)) + 16|0);
          HEAP32[$208>>2] = $205;
          $209 = ((($205)) + 24|0);
          HEAP32[$209>>2] = $$3$i;
          break;
         }
        }
       } while(0);
       $210 = ((($$0192$lcssa$i)) + 20|0);
       $211 = HEAP32[$210>>2]|0;
       $212 = ($211|0)==(0|0);
       if (!($212)) {
        $213 = HEAP32[(6432)>>2]|0;
        $214 = ($211>>>0)<($213>>>0);
        if ($214) {
         _abort();
         // unreachable;
        } else {
         $215 = ((($$3$i)) + 20|0);
         HEAP32[$215>>2] = $211;
         $216 = ((($211)) + 24|0);
         HEAP32[$216>>2] = $$3$i;
         break;
        }
       }
      }
     } while(0);
     $217 = ($$0193$lcssa$i>>>0)<(16);
     if ($217) {
      $218 = (($$0193$lcssa$i) + ($6))|0;
      $219 = $218 | 3;
      $220 = ((($$0192$lcssa$i)) + 4|0);
      HEAP32[$220>>2] = $219;
      $221 = (($$0192$lcssa$i) + ($218)|0);
      $222 = ((($221)) + 4|0);
      $223 = HEAP32[$222>>2]|0;
      $224 = $223 | 1;
      HEAP32[$222>>2] = $224;
     } else {
      $225 = $6 | 3;
      $226 = ((($$0192$lcssa$i)) + 4|0);
      HEAP32[$226>>2] = $225;
      $227 = $$0193$lcssa$i | 1;
      $228 = ((($157)) + 4|0);
      HEAP32[$228>>2] = $227;
      $229 = (($157) + ($$0193$lcssa$i)|0);
      HEAP32[$229>>2] = $$0193$lcssa$i;
      $230 = ($37|0)==(0);
      if (!($230)) {
       $231 = HEAP32[(6436)>>2]|0;
       $232 = $37 >>> 3;
       $233 = $232 << 1;
       $234 = (6456 + ($233<<2)|0);
       $235 = 1 << $232;
       $236 = $8 & $235;
       $237 = ($236|0)==(0);
       if ($237) {
        $238 = $8 | $235;
        HEAP32[1604] = $238;
        $$pre$i = ((($234)) + 8|0);
        $$0189$i = $234;$$pre$phi$iZ2D = $$pre$i;
       } else {
        $239 = ((($234)) + 8|0);
        $240 = HEAP32[$239>>2]|0;
        $241 = HEAP32[(6432)>>2]|0;
        $242 = ($240>>>0)<($241>>>0);
        if ($242) {
         _abort();
         // unreachable;
        } else {
         $$0189$i = $240;$$pre$phi$iZ2D = $239;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $231;
       $243 = ((($$0189$i)) + 12|0);
       HEAP32[$243>>2] = $231;
       $244 = ((($231)) + 8|0);
       HEAP32[$244>>2] = $$0189$i;
       $245 = ((($231)) + 12|0);
       HEAP32[$245>>2] = $234;
      }
      HEAP32[(6424)>>2] = $$0193$lcssa$i;
      HEAP32[(6436)>>2] = $157;
     }
     $246 = ((($$0192$lcssa$i)) + 8|0);
     $$0 = $246;
     STACKTOP = sp;return ($$0|0);
    }
   } else {
    $$0197 = $6;
   }
  } else {
   $247 = ($0>>>0)>(4294967231);
   if ($247) {
    $$0197 = -1;
   } else {
    $248 = (($0) + 11)|0;
    $249 = $248 & -8;
    $250 = HEAP32[(6420)>>2]|0;
    $251 = ($250|0)==(0);
    if ($251) {
     $$0197 = $249;
    } else {
     $252 = (0 - ($249))|0;
     $253 = $248 >>> 8;
     $254 = ($253|0)==(0);
     if ($254) {
      $$0358$i = 0;
     } else {
      $255 = ($249>>>0)>(16777215);
      if ($255) {
       $$0358$i = 31;
      } else {
       $256 = (($253) + 1048320)|0;
       $257 = $256 >>> 16;
       $258 = $257 & 8;
       $259 = $253 << $258;
       $260 = (($259) + 520192)|0;
       $261 = $260 >>> 16;
       $262 = $261 & 4;
       $263 = $262 | $258;
       $264 = $259 << $262;
       $265 = (($264) + 245760)|0;
       $266 = $265 >>> 16;
       $267 = $266 & 2;
       $268 = $263 | $267;
       $269 = (14 - ($268))|0;
       $270 = $264 << $267;
       $271 = $270 >>> 15;
       $272 = (($269) + ($271))|0;
       $273 = $272 << 1;
       $274 = (($272) + 7)|0;
       $275 = $249 >>> $274;
       $276 = $275 & 1;
       $277 = $276 | $273;
       $$0358$i = $277;
      }
     }
     $278 = (6720 + ($$0358$i<<2)|0);
     $279 = HEAP32[$278>>2]|0;
     $280 = ($279|0)==(0|0);
     L117: do {
      if ($280) {
       $$2355$i = 0;$$3$i201 = 0;$$3350$i = $252;
       label = 81;
      } else {
       $281 = ($$0358$i|0)==(31);
       $282 = $$0358$i >>> 1;
       $283 = (25 - ($282))|0;
       $284 = $281 ? 0 : $283;
       $285 = $249 << $284;
       $$0342$i = 0;$$0347$i = $252;$$0353$i = $279;$$0359$i = $285;$$0362$i = 0;
       while(1) {
        $286 = ((($$0353$i)) + 4|0);
        $287 = HEAP32[$286>>2]|0;
        $288 = $287 & -8;
        $289 = (($288) - ($249))|0;
        $290 = ($289>>>0)<($$0347$i>>>0);
        if ($290) {
         $291 = ($289|0)==(0);
         if ($291) {
          $$415$i = $$0353$i;$$435114$i = 0;$$435713$i = $$0353$i;
          label = 85;
          break L117;
         } else {
          $$1343$i = $$0353$i;$$1348$i = $289;
         }
        } else {
         $$1343$i = $$0342$i;$$1348$i = $$0347$i;
        }
        $292 = ((($$0353$i)) + 20|0);
        $293 = HEAP32[$292>>2]|0;
        $294 = $$0359$i >>> 31;
        $295 = (((($$0353$i)) + 16|0) + ($294<<2)|0);
        $296 = HEAP32[$295>>2]|0;
        $297 = ($293|0)==(0|0);
        $298 = ($293|0)==($296|0);
        $or$cond2$i = $297 | $298;
        $$1363$i = $or$cond2$i ? $$0362$i : $293;
        $299 = ($296|0)==(0|0);
        $not$8$i = $299 ^ 1;
        $300 = $not$8$i&1;
        $$0359$$i = $$0359$i << $300;
        if ($299) {
         $$2355$i = $$1363$i;$$3$i201 = $$1343$i;$$3350$i = $$1348$i;
         label = 81;
         break;
        } else {
         $$0342$i = $$1343$i;$$0347$i = $$1348$i;$$0353$i = $296;$$0359$i = $$0359$$i;$$0362$i = $$1363$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 81) {
      $301 = ($$2355$i|0)==(0|0);
      $302 = ($$3$i201|0)==(0|0);
      $or$cond$i = $301 & $302;
      if ($or$cond$i) {
       $303 = 2 << $$0358$i;
       $304 = (0 - ($303))|0;
       $305 = $303 | $304;
       $306 = $250 & $305;
       $307 = ($306|0)==(0);
       if ($307) {
        $$0197 = $249;
        break;
       }
       $308 = (0 - ($306))|0;
       $309 = $306 & $308;
       $310 = (($309) + -1)|0;
       $311 = $310 >>> 12;
       $312 = $311 & 16;
       $313 = $310 >>> $312;
       $314 = $313 >>> 5;
       $315 = $314 & 8;
       $316 = $315 | $312;
       $317 = $313 >>> $315;
       $318 = $317 >>> 2;
       $319 = $318 & 4;
       $320 = $316 | $319;
       $321 = $317 >>> $319;
       $322 = $321 >>> 1;
       $323 = $322 & 2;
       $324 = $320 | $323;
       $325 = $321 >>> $323;
       $326 = $325 >>> 1;
       $327 = $326 & 1;
       $328 = $324 | $327;
       $329 = $325 >>> $327;
       $330 = (($328) + ($329))|0;
       $331 = (6720 + ($330<<2)|0);
       $332 = HEAP32[$331>>2]|0;
       $$4$ph$i = 0;$$4357$ph$i = $332;
      } else {
       $$4$ph$i = $$3$i201;$$4357$ph$i = $$2355$i;
      }
      $333 = ($$4357$ph$i|0)==(0|0);
      if ($333) {
       $$4$lcssa$i = $$4$ph$i;$$4351$lcssa$i = $$3350$i;
      } else {
       $$415$i = $$4$ph$i;$$435114$i = $$3350$i;$$435713$i = $$4357$ph$i;
       label = 85;
      }
     }
     if ((label|0) == 85) {
      while(1) {
       label = 0;
       $334 = ((($$435713$i)) + 4|0);
       $335 = HEAP32[$334>>2]|0;
       $336 = $335 & -8;
       $337 = (($336) - ($249))|0;
       $338 = ($337>>>0)<($$435114$i>>>0);
       $$$4351$i = $338 ? $337 : $$435114$i;
       $$4357$$4$i = $338 ? $$435713$i : $$415$i;
       $339 = ((($$435713$i)) + 16|0);
       $340 = HEAP32[$339>>2]|0;
       $not$1$i203 = ($340|0)==(0|0);
       $$sink2$i204 = $not$1$i203&1;
       $341 = (((($$435713$i)) + 16|0) + ($$sink2$i204<<2)|0);
       $342 = HEAP32[$341>>2]|0;
       $343 = ($342|0)==(0|0);
       if ($343) {
        $$4$lcssa$i = $$4357$$4$i;$$4351$lcssa$i = $$$4351$i;
        break;
       } else {
        $$415$i = $$4357$$4$i;$$435114$i = $$$4351$i;$$435713$i = $342;
        label = 85;
       }
      }
     }
     $344 = ($$4$lcssa$i|0)==(0|0);
     if ($344) {
      $$0197 = $249;
     } else {
      $345 = HEAP32[(6424)>>2]|0;
      $346 = (($345) - ($249))|0;
      $347 = ($$4351$lcssa$i>>>0)<($346>>>0);
      if ($347) {
       $348 = HEAP32[(6432)>>2]|0;
       $349 = ($$4$lcssa$i>>>0)<($348>>>0);
       if ($349) {
        _abort();
        // unreachable;
       }
       $350 = (($$4$lcssa$i) + ($249)|0);
       $351 = ($$4$lcssa$i>>>0)<($350>>>0);
       if (!($351)) {
        _abort();
        // unreachable;
       }
       $352 = ((($$4$lcssa$i)) + 24|0);
       $353 = HEAP32[$352>>2]|0;
       $354 = ((($$4$lcssa$i)) + 12|0);
       $355 = HEAP32[$354>>2]|0;
       $356 = ($355|0)==($$4$lcssa$i|0);
       do {
        if ($356) {
         $366 = ((($$4$lcssa$i)) + 20|0);
         $367 = HEAP32[$366>>2]|0;
         $368 = ($367|0)==(0|0);
         if ($368) {
          $369 = ((($$4$lcssa$i)) + 16|0);
          $370 = HEAP32[$369>>2]|0;
          $371 = ($370|0)==(0|0);
          if ($371) {
           $$3372$i = 0;
           break;
          } else {
           $$1370$i = $370;$$1374$i = $369;
          }
         } else {
          $$1370$i = $367;$$1374$i = $366;
         }
         while(1) {
          $372 = ((($$1370$i)) + 20|0);
          $373 = HEAP32[$372>>2]|0;
          $374 = ($373|0)==(0|0);
          if (!($374)) {
           $$1370$i = $373;$$1374$i = $372;
           continue;
          }
          $375 = ((($$1370$i)) + 16|0);
          $376 = HEAP32[$375>>2]|0;
          $377 = ($376|0)==(0|0);
          if ($377) {
           break;
          } else {
           $$1370$i = $376;$$1374$i = $375;
          }
         }
         $378 = ($$1374$i>>>0)<($348>>>0);
         if ($378) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$1374$i>>2] = 0;
          $$3372$i = $$1370$i;
          break;
         }
        } else {
         $357 = ((($$4$lcssa$i)) + 8|0);
         $358 = HEAP32[$357>>2]|0;
         $359 = ($358>>>0)<($348>>>0);
         if ($359) {
          _abort();
          // unreachable;
         }
         $360 = ((($358)) + 12|0);
         $361 = HEAP32[$360>>2]|0;
         $362 = ($361|0)==($$4$lcssa$i|0);
         if (!($362)) {
          _abort();
          // unreachable;
         }
         $363 = ((($355)) + 8|0);
         $364 = HEAP32[$363>>2]|0;
         $365 = ($364|0)==($$4$lcssa$i|0);
         if ($365) {
          HEAP32[$360>>2] = $355;
          HEAP32[$363>>2] = $358;
          $$3372$i = $355;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $379 = ($353|0)==(0|0);
       L164: do {
        if ($379) {
         $470 = $250;
        } else {
         $380 = ((($$4$lcssa$i)) + 28|0);
         $381 = HEAP32[$380>>2]|0;
         $382 = (6720 + ($381<<2)|0);
         $383 = HEAP32[$382>>2]|0;
         $384 = ($$4$lcssa$i|0)==($383|0);
         do {
          if ($384) {
           HEAP32[$382>>2] = $$3372$i;
           $cond$i208 = ($$3372$i|0)==(0|0);
           if ($cond$i208) {
            $385 = 1 << $381;
            $386 = $385 ^ -1;
            $387 = $250 & $386;
            HEAP32[(6420)>>2] = $387;
            $470 = $387;
            break L164;
           }
          } else {
           $388 = HEAP32[(6432)>>2]|0;
           $389 = ($353>>>0)<($388>>>0);
           if ($389) {
            _abort();
            // unreachable;
           } else {
            $390 = ((($353)) + 16|0);
            $391 = HEAP32[$390>>2]|0;
            $not$$i209 = ($391|0)!=($$4$lcssa$i|0);
            $$sink3$i = $not$$i209&1;
            $392 = (((($353)) + 16|0) + ($$sink3$i<<2)|0);
            HEAP32[$392>>2] = $$3372$i;
            $393 = ($$3372$i|0)==(0|0);
            if ($393) {
             $470 = $250;
             break L164;
            } else {
             break;
            }
           }
          }
         } while(0);
         $394 = HEAP32[(6432)>>2]|0;
         $395 = ($$3372$i>>>0)<($394>>>0);
         if ($395) {
          _abort();
          // unreachable;
         }
         $396 = ((($$3372$i)) + 24|0);
         HEAP32[$396>>2] = $353;
         $397 = ((($$4$lcssa$i)) + 16|0);
         $398 = HEAP32[$397>>2]|0;
         $399 = ($398|0)==(0|0);
         do {
          if (!($399)) {
           $400 = ($398>>>0)<($394>>>0);
           if ($400) {
            _abort();
            // unreachable;
           } else {
            $401 = ((($$3372$i)) + 16|0);
            HEAP32[$401>>2] = $398;
            $402 = ((($398)) + 24|0);
            HEAP32[$402>>2] = $$3372$i;
            break;
           }
          }
         } while(0);
         $403 = ((($$4$lcssa$i)) + 20|0);
         $404 = HEAP32[$403>>2]|0;
         $405 = ($404|0)==(0|0);
         if ($405) {
          $470 = $250;
         } else {
          $406 = HEAP32[(6432)>>2]|0;
          $407 = ($404>>>0)<($406>>>0);
          if ($407) {
           _abort();
           // unreachable;
          } else {
           $408 = ((($$3372$i)) + 20|0);
           HEAP32[$408>>2] = $404;
           $409 = ((($404)) + 24|0);
           HEAP32[$409>>2] = $$3372$i;
           $470 = $250;
           break;
          }
         }
        }
       } while(0);
       $410 = ($$4351$lcssa$i>>>0)<(16);
       do {
        if ($410) {
         $411 = (($$4351$lcssa$i) + ($249))|0;
         $412 = $411 | 3;
         $413 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$413>>2] = $412;
         $414 = (($$4$lcssa$i) + ($411)|0);
         $415 = ((($414)) + 4|0);
         $416 = HEAP32[$415>>2]|0;
         $417 = $416 | 1;
         HEAP32[$415>>2] = $417;
        } else {
         $418 = $249 | 3;
         $419 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$419>>2] = $418;
         $420 = $$4351$lcssa$i | 1;
         $421 = ((($350)) + 4|0);
         HEAP32[$421>>2] = $420;
         $422 = (($350) + ($$4351$lcssa$i)|0);
         HEAP32[$422>>2] = $$4351$lcssa$i;
         $423 = $$4351$lcssa$i >>> 3;
         $424 = ($$4351$lcssa$i>>>0)<(256);
         if ($424) {
          $425 = $423 << 1;
          $426 = (6456 + ($425<<2)|0);
          $427 = HEAP32[1604]|0;
          $428 = 1 << $423;
          $429 = $427 & $428;
          $430 = ($429|0)==(0);
          if ($430) {
           $431 = $427 | $428;
           HEAP32[1604] = $431;
           $$pre$i210 = ((($426)) + 8|0);
           $$0368$i = $426;$$pre$phi$i211Z2D = $$pre$i210;
          } else {
           $432 = ((($426)) + 8|0);
           $433 = HEAP32[$432>>2]|0;
           $434 = HEAP32[(6432)>>2]|0;
           $435 = ($433>>>0)<($434>>>0);
           if ($435) {
            _abort();
            // unreachable;
           } else {
            $$0368$i = $433;$$pre$phi$i211Z2D = $432;
           }
          }
          HEAP32[$$pre$phi$i211Z2D>>2] = $350;
          $436 = ((($$0368$i)) + 12|0);
          HEAP32[$436>>2] = $350;
          $437 = ((($350)) + 8|0);
          HEAP32[$437>>2] = $$0368$i;
          $438 = ((($350)) + 12|0);
          HEAP32[$438>>2] = $426;
          break;
         }
         $439 = $$4351$lcssa$i >>> 8;
         $440 = ($439|0)==(0);
         if ($440) {
          $$0361$i = 0;
         } else {
          $441 = ($$4351$lcssa$i>>>0)>(16777215);
          if ($441) {
           $$0361$i = 31;
          } else {
           $442 = (($439) + 1048320)|0;
           $443 = $442 >>> 16;
           $444 = $443 & 8;
           $445 = $439 << $444;
           $446 = (($445) + 520192)|0;
           $447 = $446 >>> 16;
           $448 = $447 & 4;
           $449 = $448 | $444;
           $450 = $445 << $448;
           $451 = (($450) + 245760)|0;
           $452 = $451 >>> 16;
           $453 = $452 & 2;
           $454 = $449 | $453;
           $455 = (14 - ($454))|0;
           $456 = $450 << $453;
           $457 = $456 >>> 15;
           $458 = (($455) + ($457))|0;
           $459 = $458 << 1;
           $460 = (($458) + 7)|0;
           $461 = $$4351$lcssa$i >>> $460;
           $462 = $461 & 1;
           $463 = $462 | $459;
           $$0361$i = $463;
          }
         }
         $464 = (6720 + ($$0361$i<<2)|0);
         $465 = ((($350)) + 28|0);
         HEAP32[$465>>2] = $$0361$i;
         $466 = ((($350)) + 16|0);
         $467 = ((($466)) + 4|0);
         HEAP32[$467>>2] = 0;
         HEAP32[$466>>2] = 0;
         $468 = 1 << $$0361$i;
         $469 = $470 & $468;
         $471 = ($469|0)==(0);
         if ($471) {
          $472 = $470 | $468;
          HEAP32[(6420)>>2] = $472;
          HEAP32[$464>>2] = $350;
          $473 = ((($350)) + 24|0);
          HEAP32[$473>>2] = $464;
          $474 = ((($350)) + 12|0);
          HEAP32[$474>>2] = $350;
          $475 = ((($350)) + 8|0);
          HEAP32[$475>>2] = $350;
          break;
         }
         $476 = HEAP32[$464>>2]|0;
         $477 = ($$0361$i|0)==(31);
         $478 = $$0361$i >>> 1;
         $479 = (25 - ($478))|0;
         $480 = $477 ? 0 : $479;
         $481 = $$4351$lcssa$i << $480;
         $$0344$i = $481;$$0345$i = $476;
         while(1) {
          $482 = ((($$0345$i)) + 4|0);
          $483 = HEAP32[$482>>2]|0;
          $484 = $483 & -8;
          $485 = ($484|0)==($$4351$lcssa$i|0);
          if ($485) {
           label = 139;
           break;
          }
          $486 = $$0344$i >>> 31;
          $487 = (((($$0345$i)) + 16|0) + ($486<<2)|0);
          $488 = $$0344$i << 1;
          $489 = HEAP32[$487>>2]|0;
          $490 = ($489|0)==(0|0);
          if ($490) {
           label = 136;
           break;
          } else {
           $$0344$i = $488;$$0345$i = $489;
          }
         }
         if ((label|0) == 136) {
          $491 = HEAP32[(6432)>>2]|0;
          $492 = ($487>>>0)<($491>>>0);
          if ($492) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$487>>2] = $350;
           $493 = ((($350)) + 24|0);
           HEAP32[$493>>2] = $$0345$i;
           $494 = ((($350)) + 12|0);
           HEAP32[$494>>2] = $350;
           $495 = ((($350)) + 8|0);
           HEAP32[$495>>2] = $350;
           break;
          }
         }
         else if ((label|0) == 139) {
          $496 = ((($$0345$i)) + 8|0);
          $497 = HEAP32[$496>>2]|0;
          $498 = HEAP32[(6432)>>2]|0;
          $499 = ($497>>>0)>=($498>>>0);
          $not$9$i = ($$0345$i>>>0)>=($498>>>0);
          $500 = $499 & $not$9$i;
          if ($500) {
           $501 = ((($497)) + 12|0);
           HEAP32[$501>>2] = $350;
           HEAP32[$496>>2] = $350;
           $502 = ((($350)) + 8|0);
           HEAP32[$502>>2] = $497;
           $503 = ((($350)) + 12|0);
           HEAP32[$503>>2] = $$0345$i;
           $504 = ((($350)) + 24|0);
           HEAP32[$504>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $505 = ((($$4$lcssa$i)) + 8|0);
       $$0 = $505;
       STACKTOP = sp;return ($$0|0);
      } else {
       $$0197 = $249;
      }
     }
    }
   }
  }
 } while(0);
 $506 = HEAP32[(6424)>>2]|0;
 $507 = ($506>>>0)<($$0197>>>0);
 if (!($507)) {
  $508 = (($506) - ($$0197))|0;
  $509 = HEAP32[(6436)>>2]|0;
  $510 = ($508>>>0)>(15);
  if ($510) {
   $511 = (($509) + ($$0197)|0);
   HEAP32[(6436)>>2] = $511;
   HEAP32[(6424)>>2] = $508;
   $512 = $508 | 1;
   $513 = ((($511)) + 4|0);
   HEAP32[$513>>2] = $512;
   $514 = (($511) + ($508)|0);
   HEAP32[$514>>2] = $508;
   $515 = $$0197 | 3;
   $516 = ((($509)) + 4|0);
   HEAP32[$516>>2] = $515;
  } else {
   HEAP32[(6424)>>2] = 0;
   HEAP32[(6436)>>2] = 0;
   $517 = $506 | 3;
   $518 = ((($509)) + 4|0);
   HEAP32[$518>>2] = $517;
   $519 = (($509) + ($506)|0);
   $520 = ((($519)) + 4|0);
   $521 = HEAP32[$520>>2]|0;
   $522 = $521 | 1;
   HEAP32[$520>>2] = $522;
  }
  $523 = ((($509)) + 8|0);
  $$0 = $523;
  STACKTOP = sp;return ($$0|0);
 }
 $524 = HEAP32[(6428)>>2]|0;
 $525 = ($524>>>0)>($$0197>>>0);
 if ($525) {
  $526 = (($524) - ($$0197))|0;
  HEAP32[(6428)>>2] = $526;
  $527 = HEAP32[(6440)>>2]|0;
  $528 = (($527) + ($$0197)|0);
  HEAP32[(6440)>>2] = $528;
  $529 = $526 | 1;
  $530 = ((($528)) + 4|0);
  HEAP32[$530>>2] = $529;
  $531 = $$0197 | 3;
  $532 = ((($527)) + 4|0);
  HEAP32[$532>>2] = $531;
  $533 = ((($527)) + 8|0);
  $$0 = $533;
  STACKTOP = sp;return ($$0|0);
 }
 $534 = HEAP32[1722]|0;
 $535 = ($534|0)==(0);
 if ($535) {
  HEAP32[(6896)>>2] = 4096;
  HEAP32[(6892)>>2] = 4096;
  HEAP32[(6900)>>2] = -1;
  HEAP32[(6904)>>2] = -1;
  HEAP32[(6908)>>2] = 0;
  HEAP32[(6860)>>2] = 0;
  $536 = $1;
  $537 = $536 & -16;
  $538 = $537 ^ 1431655768;
  HEAP32[$1>>2] = $538;
  HEAP32[1722] = $538;
  $542 = 4096;
 } else {
  $$pre$i212 = HEAP32[(6896)>>2]|0;
  $542 = $$pre$i212;
 }
 $539 = (($$0197) + 48)|0;
 $540 = (($$0197) + 47)|0;
 $541 = (($542) + ($540))|0;
 $543 = (0 - ($542))|0;
 $544 = $541 & $543;
 $545 = ($544>>>0)>($$0197>>>0);
 if (!($545)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $546 = HEAP32[(6856)>>2]|0;
 $547 = ($546|0)==(0);
 if (!($547)) {
  $548 = HEAP32[(6848)>>2]|0;
  $549 = (($548) + ($544))|0;
  $550 = ($549>>>0)<=($548>>>0);
  $551 = ($549>>>0)>($546>>>0);
  $or$cond1$i = $550 | $551;
  if ($or$cond1$i) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $552 = HEAP32[(6860)>>2]|0;
 $553 = $552 & 4;
 $554 = ($553|0)==(0);
 L244: do {
  if ($554) {
   $555 = HEAP32[(6440)>>2]|0;
   $556 = ($555|0)==(0|0);
   L246: do {
    if ($556) {
     label = 163;
    } else {
     $$0$i$i = (6864);
     while(1) {
      $557 = HEAP32[$$0$i$i>>2]|0;
      $558 = ($557>>>0)>($555>>>0);
      if (!($558)) {
       $559 = ((($$0$i$i)) + 4|0);
       $560 = HEAP32[$559>>2]|0;
       $561 = (($557) + ($560)|0);
       $562 = ($561>>>0)>($555>>>0);
       if ($562) {
        break;
       }
      }
      $563 = ((($$0$i$i)) + 8|0);
      $564 = HEAP32[$563>>2]|0;
      $565 = ($564|0)==(0|0);
      if ($565) {
       label = 163;
       break L246;
      } else {
       $$0$i$i = $564;
      }
     }
     $588 = (($541) - ($524))|0;
     $589 = $588 & $543;
     $590 = ($589>>>0)<(2147483647);
     if ($590) {
      $591 = (_sbrk(($589|0))|0);
      $592 = HEAP32[$$0$i$i>>2]|0;
      $593 = HEAP32[$559>>2]|0;
      $594 = (($592) + ($593)|0);
      $595 = ($591|0)==($594|0);
      if ($595) {
       $596 = ($591|0)==((-1)|0);
       if ($596) {
        $$2234253237$i = $589;
       } else {
        $$723948$i = $589;$$749$i = $591;
        label = 180;
        break L244;
       }
      } else {
       $$2247$ph$i = $591;$$2253$ph$i = $589;
       label = 171;
      }
     } else {
      $$2234253237$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 163) {
     $566 = (_sbrk(0)|0);
     $567 = ($566|0)==((-1)|0);
     if ($567) {
      $$2234253237$i = 0;
     } else {
      $568 = $566;
      $569 = HEAP32[(6892)>>2]|0;
      $570 = (($569) + -1)|0;
      $571 = $570 & $568;
      $572 = ($571|0)==(0);
      $573 = (($570) + ($568))|0;
      $574 = (0 - ($569))|0;
      $575 = $573 & $574;
      $576 = (($575) - ($568))|0;
      $577 = $572 ? 0 : $576;
      $$$i = (($577) + ($544))|0;
      $578 = HEAP32[(6848)>>2]|0;
      $579 = (($$$i) + ($578))|0;
      $580 = ($$$i>>>0)>($$0197>>>0);
      $581 = ($$$i>>>0)<(2147483647);
      $or$cond$i214 = $580 & $581;
      if ($or$cond$i214) {
       $582 = HEAP32[(6856)>>2]|0;
       $583 = ($582|0)==(0);
       if (!($583)) {
        $584 = ($579>>>0)<=($578>>>0);
        $585 = ($579>>>0)>($582>>>0);
        $or$cond2$i215 = $584 | $585;
        if ($or$cond2$i215) {
         $$2234253237$i = 0;
         break;
        }
       }
       $586 = (_sbrk(($$$i|0))|0);
       $587 = ($586|0)==($566|0);
       if ($587) {
        $$723948$i = $$$i;$$749$i = $566;
        label = 180;
        break L244;
       } else {
        $$2247$ph$i = $586;$$2253$ph$i = $$$i;
        label = 171;
       }
      } else {
       $$2234253237$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 171) {
     $597 = (0 - ($$2253$ph$i))|0;
     $598 = ($$2247$ph$i|0)!=((-1)|0);
     $599 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $599 & $598;
     $600 = ($539>>>0)>($$2253$ph$i>>>0);
     $or$cond10$i = $600 & $or$cond7$i;
     if (!($or$cond10$i)) {
      $610 = ($$2247$ph$i|0)==((-1)|0);
      if ($610) {
       $$2234253237$i = 0;
       break;
      } else {
       $$723948$i = $$2253$ph$i;$$749$i = $$2247$ph$i;
       label = 180;
       break L244;
      }
     }
     $601 = HEAP32[(6896)>>2]|0;
     $602 = (($540) - ($$2253$ph$i))|0;
     $603 = (($602) + ($601))|0;
     $604 = (0 - ($601))|0;
     $605 = $603 & $604;
     $606 = ($605>>>0)<(2147483647);
     if (!($606)) {
      $$723948$i = $$2253$ph$i;$$749$i = $$2247$ph$i;
      label = 180;
      break L244;
     }
     $607 = (_sbrk(($605|0))|0);
     $608 = ($607|0)==((-1)|0);
     if ($608) {
      (_sbrk(($597|0))|0);
      $$2234253237$i = 0;
      break;
     } else {
      $609 = (($605) + ($$2253$ph$i))|0;
      $$723948$i = $609;$$749$i = $$2247$ph$i;
      label = 180;
      break L244;
     }
    }
   } while(0);
   $611 = HEAP32[(6860)>>2]|0;
   $612 = $611 | 4;
   HEAP32[(6860)>>2] = $612;
   $$4236$i = $$2234253237$i;
   label = 178;
  } else {
   $$4236$i = 0;
   label = 178;
  }
 } while(0);
 if ((label|0) == 178) {
  $613 = ($544>>>0)<(2147483647);
  if ($613) {
   $614 = (_sbrk(($544|0))|0);
   $615 = (_sbrk(0)|0);
   $616 = ($614|0)!=((-1)|0);
   $617 = ($615|0)!=((-1)|0);
   $or$cond5$i = $616 & $617;
   $618 = ($614>>>0)<($615>>>0);
   $or$cond11$i = $618 & $or$cond5$i;
   $619 = $615;
   $620 = $614;
   $621 = (($619) - ($620))|0;
   $622 = (($$0197) + 40)|0;
   $623 = ($621>>>0)>($622>>>0);
   $$$4236$i = $623 ? $621 : $$4236$i;
   $or$cond11$not$i = $or$cond11$i ^ 1;
   $624 = ($614|0)==((-1)|0);
   $not$$i216 = $623 ^ 1;
   $625 = $624 | $not$$i216;
   $or$cond50$i = $625 | $or$cond11$not$i;
   if (!($or$cond50$i)) {
    $$723948$i = $$$4236$i;$$749$i = $614;
    label = 180;
   }
  }
 }
 if ((label|0) == 180) {
  $626 = HEAP32[(6848)>>2]|0;
  $627 = (($626) + ($$723948$i))|0;
  HEAP32[(6848)>>2] = $627;
  $628 = HEAP32[(6852)>>2]|0;
  $629 = ($627>>>0)>($628>>>0);
  if ($629) {
   HEAP32[(6852)>>2] = $627;
  }
  $630 = HEAP32[(6440)>>2]|0;
  $631 = ($630|0)==(0|0);
  do {
   if ($631) {
    $632 = HEAP32[(6432)>>2]|0;
    $633 = ($632|0)==(0|0);
    $634 = ($$749$i>>>0)<($632>>>0);
    $or$cond12$i = $633 | $634;
    if ($or$cond12$i) {
     HEAP32[(6432)>>2] = $$749$i;
    }
    HEAP32[(6864)>>2] = $$749$i;
    HEAP32[(6868)>>2] = $$723948$i;
    HEAP32[(6876)>>2] = 0;
    $635 = HEAP32[1722]|0;
    HEAP32[(6452)>>2] = $635;
    HEAP32[(6448)>>2] = -1;
    $$01$i$i = 0;
    while(1) {
     $636 = $$01$i$i << 1;
     $637 = (6456 + ($636<<2)|0);
     $638 = ((($637)) + 12|0);
     HEAP32[$638>>2] = $637;
     $639 = ((($637)) + 8|0);
     HEAP32[$639>>2] = $637;
     $640 = (($$01$i$i) + 1)|0;
     $exitcond$i$i = ($640|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $$01$i$i = $640;
     }
    }
    $641 = (($$723948$i) + -40)|0;
    $642 = ((($$749$i)) + 8|0);
    $643 = $642;
    $644 = $643 & 7;
    $645 = ($644|0)==(0);
    $646 = (0 - ($643))|0;
    $647 = $646 & 7;
    $648 = $645 ? 0 : $647;
    $649 = (($$749$i) + ($648)|0);
    $650 = (($641) - ($648))|0;
    HEAP32[(6440)>>2] = $649;
    HEAP32[(6428)>>2] = $650;
    $651 = $650 | 1;
    $652 = ((($649)) + 4|0);
    HEAP32[$652>>2] = $651;
    $653 = (($649) + ($650)|0);
    $654 = ((($653)) + 4|0);
    HEAP32[$654>>2] = 40;
    $655 = HEAP32[(6904)>>2]|0;
    HEAP32[(6444)>>2] = $655;
   } else {
    $$024371$i = (6864);
    while(1) {
     $656 = HEAP32[$$024371$i>>2]|0;
     $657 = ((($$024371$i)) + 4|0);
     $658 = HEAP32[$657>>2]|0;
     $659 = (($656) + ($658)|0);
     $660 = ($$749$i|0)==($659|0);
     if ($660) {
      label = 190;
      break;
     }
     $661 = ((($$024371$i)) + 8|0);
     $662 = HEAP32[$661>>2]|0;
     $663 = ($662|0)==(0|0);
     if ($663) {
      break;
     } else {
      $$024371$i = $662;
     }
    }
    if ((label|0) == 190) {
     $664 = ((($$024371$i)) + 12|0);
     $665 = HEAP32[$664>>2]|0;
     $666 = $665 & 8;
     $667 = ($666|0)==(0);
     if ($667) {
      $668 = ($630>>>0)>=($656>>>0);
      $669 = ($630>>>0)<($$749$i>>>0);
      $or$cond51$i = $669 & $668;
      if ($or$cond51$i) {
       $670 = (($658) + ($$723948$i))|0;
       HEAP32[$657>>2] = $670;
       $671 = HEAP32[(6428)>>2]|0;
       $672 = ((($630)) + 8|0);
       $673 = $672;
       $674 = $673 & 7;
       $675 = ($674|0)==(0);
       $676 = (0 - ($673))|0;
       $677 = $676 & 7;
       $678 = $675 ? 0 : $677;
       $679 = (($630) + ($678)|0);
       $680 = (($$723948$i) - ($678))|0;
       $681 = (($671) + ($680))|0;
       HEAP32[(6440)>>2] = $679;
       HEAP32[(6428)>>2] = $681;
       $682 = $681 | 1;
       $683 = ((($679)) + 4|0);
       HEAP32[$683>>2] = $682;
       $684 = (($679) + ($681)|0);
       $685 = ((($684)) + 4|0);
       HEAP32[$685>>2] = 40;
       $686 = HEAP32[(6904)>>2]|0;
       HEAP32[(6444)>>2] = $686;
       break;
      }
     }
    }
    $687 = HEAP32[(6432)>>2]|0;
    $688 = ($$749$i>>>0)<($687>>>0);
    if ($688) {
     HEAP32[(6432)>>2] = $$749$i;
     $752 = $$749$i;
    } else {
     $752 = $687;
    }
    $689 = (($$749$i) + ($$723948$i)|0);
    $$124470$i = (6864);
    while(1) {
     $690 = HEAP32[$$124470$i>>2]|0;
     $691 = ($690|0)==($689|0);
     if ($691) {
      label = 198;
      break;
     }
     $692 = ((($$124470$i)) + 8|0);
     $693 = HEAP32[$692>>2]|0;
     $694 = ($693|0)==(0|0);
     if ($694) {
      break;
     } else {
      $$124470$i = $693;
     }
    }
    if ((label|0) == 198) {
     $695 = ((($$124470$i)) + 12|0);
     $696 = HEAP32[$695>>2]|0;
     $697 = $696 & 8;
     $698 = ($697|0)==(0);
     if ($698) {
      HEAP32[$$124470$i>>2] = $$749$i;
      $699 = ((($$124470$i)) + 4|0);
      $700 = HEAP32[$699>>2]|0;
      $701 = (($700) + ($$723948$i))|0;
      HEAP32[$699>>2] = $701;
      $702 = ((($$749$i)) + 8|0);
      $703 = $702;
      $704 = $703 & 7;
      $705 = ($704|0)==(0);
      $706 = (0 - ($703))|0;
      $707 = $706 & 7;
      $708 = $705 ? 0 : $707;
      $709 = (($$749$i) + ($708)|0);
      $710 = ((($689)) + 8|0);
      $711 = $710;
      $712 = $711 & 7;
      $713 = ($712|0)==(0);
      $714 = (0 - ($711))|0;
      $715 = $714 & 7;
      $716 = $713 ? 0 : $715;
      $717 = (($689) + ($716)|0);
      $718 = $717;
      $719 = $709;
      $720 = (($718) - ($719))|0;
      $721 = (($709) + ($$0197)|0);
      $722 = (($720) - ($$0197))|0;
      $723 = $$0197 | 3;
      $724 = ((($709)) + 4|0);
      HEAP32[$724>>2] = $723;
      $725 = ($717|0)==($630|0);
      do {
       if ($725) {
        $726 = HEAP32[(6428)>>2]|0;
        $727 = (($726) + ($722))|0;
        HEAP32[(6428)>>2] = $727;
        HEAP32[(6440)>>2] = $721;
        $728 = $727 | 1;
        $729 = ((($721)) + 4|0);
        HEAP32[$729>>2] = $728;
       } else {
        $730 = HEAP32[(6436)>>2]|0;
        $731 = ($717|0)==($730|0);
        if ($731) {
         $732 = HEAP32[(6424)>>2]|0;
         $733 = (($732) + ($722))|0;
         HEAP32[(6424)>>2] = $733;
         HEAP32[(6436)>>2] = $721;
         $734 = $733 | 1;
         $735 = ((($721)) + 4|0);
         HEAP32[$735>>2] = $734;
         $736 = (($721) + ($733)|0);
         HEAP32[$736>>2] = $733;
         break;
        }
        $737 = ((($717)) + 4|0);
        $738 = HEAP32[$737>>2]|0;
        $739 = $738 & 3;
        $740 = ($739|0)==(1);
        if ($740) {
         $741 = $738 & -8;
         $742 = $738 >>> 3;
         $743 = ($738>>>0)<(256);
         L314: do {
          if ($743) {
           $744 = ((($717)) + 8|0);
           $745 = HEAP32[$744>>2]|0;
           $746 = ((($717)) + 12|0);
           $747 = HEAP32[$746>>2]|0;
           $748 = $742 << 1;
           $749 = (6456 + ($748<<2)|0);
           $750 = ($745|0)==($749|0);
           do {
            if (!($750)) {
             $751 = ($745>>>0)<($752>>>0);
             if ($751) {
              _abort();
              // unreachable;
             }
             $753 = ((($745)) + 12|0);
             $754 = HEAP32[$753>>2]|0;
             $755 = ($754|0)==($717|0);
             if ($755) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $756 = ($747|0)==($745|0);
           if ($756) {
            $757 = 1 << $742;
            $758 = $757 ^ -1;
            $759 = HEAP32[1604]|0;
            $760 = $759 & $758;
            HEAP32[1604] = $760;
            break;
           }
           $761 = ($747|0)==($749|0);
           do {
            if ($761) {
             $$pre10$i$i = ((($747)) + 8|0);
             $$pre$phi11$i$iZ2D = $$pre10$i$i;
            } else {
             $762 = ($747>>>0)<($752>>>0);
             if ($762) {
              _abort();
              // unreachable;
             }
             $763 = ((($747)) + 8|0);
             $764 = HEAP32[$763>>2]|0;
             $765 = ($764|0)==($717|0);
             if ($765) {
              $$pre$phi11$i$iZ2D = $763;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $766 = ((($745)) + 12|0);
           HEAP32[$766>>2] = $747;
           HEAP32[$$pre$phi11$i$iZ2D>>2] = $745;
          } else {
           $767 = ((($717)) + 24|0);
           $768 = HEAP32[$767>>2]|0;
           $769 = ((($717)) + 12|0);
           $770 = HEAP32[$769>>2]|0;
           $771 = ($770|0)==($717|0);
           do {
            if ($771) {
             $781 = ((($717)) + 16|0);
             $782 = ((($781)) + 4|0);
             $783 = HEAP32[$782>>2]|0;
             $784 = ($783|0)==(0|0);
             if ($784) {
              $785 = HEAP32[$781>>2]|0;
              $786 = ($785|0)==(0|0);
              if ($786) {
               $$3$i$i = 0;
               break;
              } else {
               $$1291$i$i = $785;$$1293$i$i = $781;
              }
             } else {
              $$1291$i$i = $783;$$1293$i$i = $782;
             }
             while(1) {
              $787 = ((($$1291$i$i)) + 20|0);
              $788 = HEAP32[$787>>2]|0;
              $789 = ($788|0)==(0|0);
              if (!($789)) {
               $$1291$i$i = $788;$$1293$i$i = $787;
               continue;
              }
              $790 = ((($$1291$i$i)) + 16|0);
              $791 = HEAP32[$790>>2]|0;
              $792 = ($791|0)==(0|0);
              if ($792) {
               break;
              } else {
               $$1291$i$i = $791;$$1293$i$i = $790;
              }
             }
             $793 = ($$1293$i$i>>>0)<($752>>>0);
             if ($793) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$$1293$i$i>>2] = 0;
              $$3$i$i = $$1291$i$i;
              break;
             }
            } else {
             $772 = ((($717)) + 8|0);
             $773 = HEAP32[$772>>2]|0;
             $774 = ($773>>>0)<($752>>>0);
             if ($774) {
              _abort();
              // unreachable;
             }
             $775 = ((($773)) + 12|0);
             $776 = HEAP32[$775>>2]|0;
             $777 = ($776|0)==($717|0);
             if (!($777)) {
              _abort();
              // unreachable;
             }
             $778 = ((($770)) + 8|0);
             $779 = HEAP32[$778>>2]|0;
             $780 = ($779|0)==($717|0);
             if ($780) {
              HEAP32[$775>>2] = $770;
              HEAP32[$778>>2] = $773;
              $$3$i$i = $770;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $794 = ($768|0)==(0|0);
           if ($794) {
            break;
           }
           $795 = ((($717)) + 28|0);
           $796 = HEAP32[$795>>2]|0;
           $797 = (6720 + ($796<<2)|0);
           $798 = HEAP32[$797>>2]|0;
           $799 = ($717|0)==($798|0);
           do {
            if ($799) {
             HEAP32[$797>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $800 = 1 << $796;
             $801 = $800 ^ -1;
             $802 = HEAP32[(6420)>>2]|0;
             $803 = $802 & $801;
             HEAP32[(6420)>>2] = $803;
             break L314;
            } else {
             $804 = HEAP32[(6432)>>2]|0;
             $805 = ($768>>>0)<($804>>>0);
             if ($805) {
              _abort();
              // unreachable;
             } else {
              $806 = ((($768)) + 16|0);
              $807 = HEAP32[$806>>2]|0;
              $not$$i17$i = ($807|0)!=($717|0);
              $$sink1$i$i = $not$$i17$i&1;
              $808 = (((($768)) + 16|0) + ($$sink1$i$i<<2)|0);
              HEAP32[$808>>2] = $$3$i$i;
              $809 = ($$3$i$i|0)==(0|0);
              if ($809) {
               break L314;
              } else {
               break;
              }
             }
            }
           } while(0);
           $810 = HEAP32[(6432)>>2]|0;
           $811 = ($$3$i$i>>>0)<($810>>>0);
           if ($811) {
            _abort();
            // unreachable;
           }
           $812 = ((($$3$i$i)) + 24|0);
           HEAP32[$812>>2] = $768;
           $813 = ((($717)) + 16|0);
           $814 = HEAP32[$813>>2]|0;
           $815 = ($814|0)==(0|0);
           do {
            if (!($815)) {
             $816 = ($814>>>0)<($810>>>0);
             if ($816) {
              _abort();
              // unreachable;
             } else {
              $817 = ((($$3$i$i)) + 16|0);
              HEAP32[$817>>2] = $814;
              $818 = ((($814)) + 24|0);
              HEAP32[$818>>2] = $$3$i$i;
              break;
             }
            }
           } while(0);
           $819 = ((($813)) + 4|0);
           $820 = HEAP32[$819>>2]|0;
           $821 = ($820|0)==(0|0);
           if ($821) {
            break;
           }
           $822 = HEAP32[(6432)>>2]|0;
           $823 = ($820>>>0)<($822>>>0);
           if ($823) {
            _abort();
            // unreachable;
           } else {
            $824 = ((($$3$i$i)) + 20|0);
            HEAP32[$824>>2] = $820;
            $825 = ((($820)) + 24|0);
            HEAP32[$825>>2] = $$3$i$i;
            break;
           }
          }
         } while(0);
         $826 = (($717) + ($741)|0);
         $827 = (($741) + ($722))|0;
         $$0$i18$i = $826;$$0287$i$i = $827;
        } else {
         $$0$i18$i = $717;$$0287$i$i = $722;
        }
        $828 = ((($$0$i18$i)) + 4|0);
        $829 = HEAP32[$828>>2]|0;
        $830 = $829 & -2;
        HEAP32[$828>>2] = $830;
        $831 = $$0287$i$i | 1;
        $832 = ((($721)) + 4|0);
        HEAP32[$832>>2] = $831;
        $833 = (($721) + ($$0287$i$i)|0);
        HEAP32[$833>>2] = $$0287$i$i;
        $834 = $$0287$i$i >>> 3;
        $835 = ($$0287$i$i>>>0)<(256);
        if ($835) {
         $836 = $834 << 1;
         $837 = (6456 + ($836<<2)|0);
         $838 = HEAP32[1604]|0;
         $839 = 1 << $834;
         $840 = $838 & $839;
         $841 = ($840|0)==(0);
         do {
          if ($841) {
           $842 = $838 | $839;
           HEAP32[1604] = $842;
           $$pre$i19$i = ((($837)) + 8|0);
           $$0295$i$i = $837;$$pre$phi$i20$iZ2D = $$pre$i19$i;
          } else {
           $843 = ((($837)) + 8|0);
           $844 = HEAP32[$843>>2]|0;
           $845 = HEAP32[(6432)>>2]|0;
           $846 = ($844>>>0)<($845>>>0);
           if (!($846)) {
            $$0295$i$i = $844;$$pre$phi$i20$iZ2D = $843;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i20$iZ2D>>2] = $721;
         $847 = ((($$0295$i$i)) + 12|0);
         HEAP32[$847>>2] = $721;
         $848 = ((($721)) + 8|0);
         HEAP32[$848>>2] = $$0295$i$i;
         $849 = ((($721)) + 12|0);
         HEAP32[$849>>2] = $837;
         break;
        }
        $850 = $$0287$i$i >>> 8;
        $851 = ($850|0)==(0);
        do {
         if ($851) {
          $$0296$i$i = 0;
         } else {
          $852 = ($$0287$i$i>>>0)>(16777215);
          if ($852) {
           $$0296$i$i = 31;
           break;
          }
          $853 = (($850) + 1048320)|0;
          $854 = $853 >>> 16;
          $855 = $854 & 8;
          $856 = $850 << $855;
          $857 = (($856) + 520192)|0;
          $858 = $857 >>> 16;
          $859 = $858 & 4;
          $860 = $859 | $855;
          $861 = $856 << $859;
          $862 = (($861) + 245760)|0;
          $863 = $862 >>> 16;
          $864 = $863 & 2;
          $865 = $860 | $864;
          $866 = (14 - ($865))|0;
          $867 = $861 << $864;
          $868 = $867 >>> 15;
          $869 = (($866) + ($868))|0;
          $870 = $869 << 1;
          $871 = (($869) + 7)|0;
          $872 = $$0287$i$i >>> $871;
          $873 = $872 & 1;
          $874 = $873 | $870;
          $$0296$i$i = $874;
         }
        } while(0);
        $875 = (6720 + ($$0296$i$i<<2)|0);
        $876 = ((($721)) + 28|0);
        HEAP32[$876>>2] = $$0296$i$i;
        $877 = ((($721)) + 16|0);
        $878 = ((($877)) + 4|0);
        HEAP32[$878>>2] = 0;
        HEAP32[$877>>2] = 0;
        $879 = HEAP32[(6420)>>2]|0;
        $880 = 1 << $$0296$i$i;
        $881 = $879 & $880;
        $882 = ($881|0)==(0);
        if ($882) {
         $883 = $879 | $880;
         HEAP32[(6420)>>2] = $883;
         HEAP32[$875>>2] = $721;
         $884 = ((($721)) + 24|0);
         HEAP32[$884>>2] = $875;
         $885 = ((($721)) + 12|0);
         HEAP32[$885>>2] = $721;
         $886 = ((($721)) + 8|0);
         HEAP32[$886>>2] = $721;
         break;
        }
        $887 = HEAP32[$875>>2]|0;
        $888 = ($$0296$i$i|0)==(31);
        $889 = $$0296$i$i >>> 1;
        $890 = (25 - ($889))|0;
        $891 = $888 ? 0 : $890;
        $892 = $$0287$i$i << $891;
        $$0288$i$i = $892;$$0289$i$i = $887;
        while(1) {
         $893 = ((($$0289$i$i)) + 4|0);
         $894 = HEAP32[$893>>2]|0;
         $895 = $894 & -8;
         $896 = ($895|0)==($$0287$i$i|0);
         if ($896) {
          label = 265;
          break;
         }
         $897 = $$0288$i$i >>> 31;
         $898 = (((($$0289$i$i)) + 16|0) + ($897<<2)|0);
         $899 = $$0288$i$i << 1;
         $900 = HEAP32[$898>>2]|0;
         $901 = ($900|0)==(0|0);
         if ($901) {
          label = 262;
          break;
         } else {
          $$0288$i$i = $899;$$0289$i$i = $900;
         }
        }
        if ((label|0) == 262) {
         $902 = HEAP32[(6432)>>2]|0;
         $903 = ($898>>>0)<($902>>>0);
         if ($903) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$898>>2] = $721;
          $904 = ((($721)) + 24|0);
          HEAP32[$904>>2] = $$0289$i$i;
          $905 = ((($721)) + 12|0);
          HEAP32[$905>>2] = $721;
          $906 = ((($721)) + 8|0);
          HEAP32[$906>>2] = $721;
          break;
         }
        }
        else if ((label|0) == 265) {
         $907 = ((($$0289$i$i)) + 8|0);
         $908 = HEAP32[$907>>2]|0;
         $909 = HEAP32[(6432)>>2]|0;
         $910 = ($908>>>0)>=($909>>>0);
         $not$7$i$i = ($$0289$i$i>>>0)>=($909>>>0);
         $911 = $910 & $not$7$i$i;
         if ($911) {
          $912 = ((($908)) + 12|0);
          HEAP32[$912>>2] = $721;
          HEAP32[$907>>2] = $721;
          $913 = ((($721)) + 8|0);
          HEAP32[$913>>2] = $908;
          $914 = ((($721)) + 12|0);
          HEAP32[$914>>2] = $$0289$i$i;
          $915 = ((($721)) + 24|0);
          HEAP32[$915>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1047 = ((($709)) + 8|0);
      $$0 = $1047;
      STACKTOP = sp;return ($$0|0);
     }
    }
    $$0$i$i$i = (6864);
    while(1) {
     $916 = HEAP32[$$0$i$i$i>>2]|0;
     $917 = ($916>>>0)>($630>>>0);
     if (!($917)) {
      $918 = ((($$0$i$i$i)) + 4|0);
      $919 = HEAP32[$918>>2]|0;
      $920 = (($916) + ($919)|0);
      $921 = ($920>>>0)>($630>>>0);
      if ($921) {
       break;
      }
     }
     $922 = ((($$0$i$i$i)) + 8|0);
     $923 = HEAP32[$922>>2]|0;
     $$0$i$i$i = $923;
    }
    $924 = ((($920)) + -47|0);
    $925 = ((($924)) + 8|0);
    $926 = $925;
    $927 = $926 & 7;
    $928 = ($927|0)==(0);
    $929 = (0 - ($926))|0;
    $930 = $929 & 7;
    $931 = $928 ? 0 : $930;
    $932 = (($924) + ($931)|0);
    $933 = ((($630)) + 16|0);
    $934 = ($932>>>0)<($933>>>0);
    $935 = $934 ? $630 : $932;
    $936 = ((($935)) + 8|0);
    $937 = ((($935)) + 24|0);
    $938 = (($$723948$i) + -40)|0;
    $939 = ((($$749$i)) + 8|0);
    $940 = $939;
    $941 = $940 & 7;
    $942 = ($941|0)==(0);
    $943 = (0 - ($940))|0;
    $944 = $943 & 7;
    $945 = $942 ? 0 : $944;
    $946 = (($$749$i) + ($945)|0);
    $947 = (($938) - ($945))|0;
    HEAP32[(6440)>>2] = $946;
    HEAP32[(6428)>>2] = $947;
    $948 = $947 | 1;
    $949 = ((($946)) + 4|0);
    HEAP32[$949>>2] = $948;
    $950 = (($946) + ($947)|0);
    $951 = ((($950)) + 4|0);
    HEAP32[$951>>2] = 40;
    $952 = HEAP32[(6904)>>2]|0;
    HEAP32[(6444)>>2] = $952;
    $953 = ((($935)) + 4|0);
    HEAP32[$953>>2] = 27;
    ;HEAP32[$936>>2]=HEAP32[(6864)>>2]|0;HEAP32[$936+4>>2]=HEAP32[(6864)+4>>2]|0;HEAP32[$936+8>>2]=HEAP32[(6864)+8>>2]|0;HEAP32[$936+12>>2]=HEAP32[(6864)+12>>2]|0;
    HEAP32[(6864)>>2] = $$749$i;
    HEAP32[(6868)>>2] = $$723948$i;
    HEAP32[(6876)>>2] = 0;
    HEAP32[(6872)>>2] = $936;
    $955 = $937;
    while(1) {
     $954 = ((($955)) + 4|0);
     HEAP32[$954>>2] = 7;
     $956 = ((($955)) + 8|0);
     $957 = ($956>>>0)<($920>>>0);
     if ($957) {
      $955 = $954;
     } else {
      break;
     }
    }
    $958 = ($935|0)==($630|0);
    if (!($958)) {
     $959 = $935;
     $960 = $630;
     $961 = (($959) - ($960))|0;
     $962 = HEAP32[$953>>2]|0;
     $963 = $962 & -2;
     HEAP32[$953>>2] = $963;
     $964 = $961 | 1;
     $965 = ((($630)) + 4|0);
     HEAP32[$965>>2] = $964;
     HEAP32[$935>>2] = $961;
     $966 = $961 >>> 3;
     $967 = ($961>>>0)<(256);
     if ($967) {
      $968 = $966 << 1;
      $969 = (6456 + ($968<<2)|0);
      $970 = HEAP32[1604]|0;
      $971 = 1 << $966;
      $972 = $970 & $971;
      $973 = ($972|0)==(0);
      if ($973) {
       $974 = $970 | $971;
       HEAP32[1604] = $974;
       $$pre$i$i = ((($969)) + 8|0);
       $$0211$i$i = $969;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $975 = ((($969)) + 8|0);
       $976 = HEAP32[$975>>2]|0;
       $977 = HEAP32[(6432)>>2]|0;
       $978 = ($976>>>0)<($977>>>0);
       if ($978) {
        _abort();
        // unreachable;
       } else {
        $$0211$i$i = $976;$$pre$phi$i$iZ2D = $975;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $630;
      $979 = ((($$0211$i$i)) + 12|0);
      HEAP32[$979>>2] = $630;
      $980 = ((($630)) + 8|0);
      HEAP32[$980>>2] = $$0211$i$i;
      $981 = ((($630)) + 12|0);
      HEAP32[$981>>2] = $969;
      break;
     }
     $982 = $961 >>> 8;
     $983 = ($982|0)==(0);
     if ($983) {
      $$0212$i$i = 0;
     } else {
      $984 = ($961>>>0)>(16777215);
      if ($984) {
       $$0212$i$i = 31;
      } else {
       $985 = (($982) + 1048320)|0;
       $986 = $985 >>> 16;
       $987 = $986 & 8;
       $988 = $982 << $987;
       $989 = (($988) + 520192)|0;
       $990 = $989 >>> 16;
       $991 = $990 & 4;
       $992 = $991 | $987;
       $993 = $988 << $991;
       $994 = (($993) + 245760)|0;
       $995 = $994 >>> 16;
       $996 = $995 & 2;
       $997 = $992 | $996;
       $998 = (14 - ($997))|0;
       $999 = $993 << $996;
       $1000 = $999 >>> 15;
       $1001 = (($998) + ($1000))|0;
       $1002 = $1001 << 1;
       $1003 = (($1001) + 7)|0;
       $1004 = $961 >>> $1003;
       $1005 = $1004 & 1;
       $1006 = $1005 | $1002;
       $$0212$i$i = $1006;
      }
     }
     $1007 = (6720 + ($$0212$i$i<<2)|0);
     $1008 = ((($630)) + 28|0);
     HEAP32[$1008>>2] = $$0212$i$i;
     $1009 = ((($630)) + 20|0);
     HEAP32[$1009>>2] = 0;
     HEAP32[$933>>2] = 0;
     $1010 = HEAP32[(6420)>>2]|0;
     $1011 = 1 << $$0212$i$i;
     $1012 = $1010 & $1011;
     $1013 = ($1012|0)==(0);
     if ($1013) {
      $1014 = $1010 | $1011;
      HEAP32[(6420)>>2] = $1014;
      HEAP32[$1007>>2] = $630;
      $1015 = ((($630)) + 24|0);
      HEAP32[$1015>>2] = $1007;
      $1016 = ((($630)) + 12|0);
      HEAP32[$1016>>2] = $630;
      $1017 = ((($630)) + 8|0);
      HEAP32[$1017>>2] = $630;
      break;
     }
     $1018 = HEAP32[$1007>>2]|0;
     $1019 = ($$0212$i$i|0)==(31);
     $1020 = $$0212$i$i >>> 1;
     $1021 = (25 - ($1020))|0;
     $1022 = $1019 ? 0 : $1021;
     $1023 = $961 << $1022;
     $$0206$i$i = $1023;$$0207$i$i = $1018;
     while(1) {
      $1024 = ((($$0207$i$i)) + 4|0);
      $1025 = HEAP32[$1024>>2]|0;
      $1026 = $1025 & -8;
      $1027 = ($1026|0)==($961|0);
      if ($1027) {
       label = 292;
       break;
      }
      $1028 = $$0206$i$i >>> 31;
      $1029 = (((($$0207$i$i)) + 16|0) + ($1028<<2)|0);
      $1030 = $$0206$i$i << 1;
      $1031 = HEAP32[$1029>>2]|0;
      $1032 = ($1031|0)==(0|0);
      if ($1032) {
       label = 289;
       break;
      } else {
       $$0206$i$i = $1030;$$0207$i$i = $1031;
      }
     }
     if ((label|0) == 289) {
      $1033 = HEAP32[(6432)>>2]|0;
      $1034 = ($1029>>>0)<($1033>>>0);
      if ($1034) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$1029>>2] = $630;
       $1035 = ((($630)) + 24|0);
       HEAP32[$1035>>2] = $$0207$i$i;
       $1036 = ((($630)) + 12|0);
       HEAP32[$1036>>2] = $630;
       $1037 = ((($630)) + 8|0);
       HEAP32[$1037>>2] = $630;
       break;
      }
     }
     else if ((label|0) == 292) {
      $1038 = ((($$0207$i$i)) + 8|0);
      $1039 = HEAP32[$1038>>2]|0;
      $1040 = HEAP32[(6432)>>2]|0;
      $1041 = ($1039>>>0)>=($1040>>>0);
      $not$$i$i = ($$0207$i$i>>>0)>=($1040>>>0);
      $1042 = $1041 & $not$$i$i;
      if ($1042) {
       $1043 = ((($1039)) + 12|0);
       HEAP32[$1043>>2] = $630;
       HEAP32[$1038>>2] = $630;
       $1044 = ((($630)) + 8|0);
       HEAP32[$1044>>2] = $1039;
       $1045 = ((($630)) + 12|0);
       HEAP32[$1045>>2] = $$0207$i$i;
       $1046 = ((($630)) + 24|0);
       HEAP32[$1046>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1048 = HEAP32[(6428)>>2]|0;
  $1049 = ($1048>>>0)>($$0197>>>0);
  if ($1049) {
   $1050 = (($1048) - ($$0197))|0;
   HEAP32[(6428)>>2] = $1050;
   $1051 = HEAP32[(6440)>>2]|0;
   $1052 = (($1051) + ($$0197)|0);
   HEAP32[(6440)>>2] = $1052;
   $1053 = $1050 | 1;
   $1054 = ((($1052)) + 4|0);
   HEAP32[$1054>>2] = $1053;
   $1055 = $$0197 | 3;
   $1056 = ((($1051)) + 4|0);
   HEAP32[$1056>>2] = $1055;
   $1057 = ((($1051)) + 8|0);
   $$0 = $1057;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $1058 = (___errno_location()|0);
 HEAP32[$1058>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre = 0, $$pre$phi443Z2D = 0, $$pre$phi445Z2D = 0, $$pre$phiZ2D = 0, $$pre442 = 0;
 var $$pre444 = 0, $$sink3 = 0, $$sink5 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0;
 var $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0;
 var $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0;
 var $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0;
 var $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0;
 var $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0;
 var $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0;
 var $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0;
 var $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0;
 var $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $cond421 = 0, $cond422 = 0, $not$ = 0, $not$405 = 0, $not$437 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(6432)>>2]|0;
 $4 = ($2>>>0)<($3>>>0);
 if ($4) {
  _abort();
  // unreachable;
 }
 $5 = ((($0)) + -4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 & 3;
 $8 = ($7|0)==(1);
 if ($8) {
  _abort();
  // unreachable;
 }
 $9 = $6 & -8;
 $10 = (($2) + ($9)|0);
 $11 = $6 & 1;
 $12 = ($11|0)==(0);
 L10: do {
  if ($12) {
   $13 = HEAP32[$2>>2]|0;
   $14 = ($7|0)==(0);
   if ($14) {
    return;
   }
   $15 = (0 - ($13))|0;
   $16 = (($2) + ($15)|0);
   $17 = (($13) + ($9))|0;
   $18 = ($16>>>0)<($3>>>0);
   if ($18) {
    _abort();
    // unreachable;
   }
   $19 = HEAP32[(6436)>>2]|0;
   $20 = ($16|0)==($19|0);
   if ($20) {
    $104 = ((($10)) + 4|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = $105 & 3;
    $107 = ($106|0)==(3);
    if (!($107)) {
     $$1 = $16;$$1382 = $17;$113 = $16;
     break;
    }
    $108 = (($16) + ($17)|0);
    $109 = ((($16)) + 4|0);
    $110 = $17 | 1;
    $111 = $105 & -2;
    HEAP32[(6424)>>2] = $17;
    HEAP32[$104>>2] = $111;
    HEAP32[$109>>2] = $110;
    HEAP32[$108>>2] = $17;
    return;
   }
   $21 = $13 >>> 3;
   $22 = ($13>>>0)<(256);
   if ($22) {
    $23 = ((($16)) + 8|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ((($16)) + 12|0);
    $26 = HEAP32[$25>>2]|0;
    $27 = $21 << 1;
    $28 = (6456 + ($27<<2)|0);
    $29 = ($24|0)==($28|0);
    if (!($29)) {
     $30 = ($24>>>0)<($3>>>0);
     if ($30) {
      _abort();
      // unreachable;
     }
     $31 = ((($24)) + 12|0);
     $32 = HEAP32[$31>>2]|0;
     $33 = ($32|0)==($16|0);
     if (!($33)) {
      _abort();
      // unreachable;
     }
    }
    $34 = ($26|0)==($24|0);
    if ($34) {
     $35 = 1 << $21;
     $36 = $35 ^ -1;
     $37 = HEAP32[1604]|0;
     $38 = $37 & $36;
     HEAP32[1604] = $38;
     $$1 = $16;$$1382 = $17;$113 = $16;
     break;
    }
    $39 = ($26|0)==($28|0);
    if ($39) {
     $$pre444 = ((($26)) + 8|0);
     $$pre$phi445Z2D = $$pre444;
    } else {
     $40 = ($26>>>0)<($3>>>0);
     if ($40) {
      _abort();
      // unreachable;
     }
     $41 = ((($26)) + 8|0);
     $42 = HEAP32[$41>>2]|0;
     $43 = ($42|0)==($16|0);
     if ($43) {
      $$pre$phi445Z2D = $41;
     } else {
      _abort();
      // unreachable;
     }
    }
    $44 = ((($24)) + 12|0);
    HEAP32[$44>>2] = $26;
    HEAP32[$$pre$phi445Z2D>>2] = $24;
    $$1 = $16;$$1382 = $17;$113 = $16;
    break;
   }
   $45 = ((($16)) + 24|0);
   $46 = HEAP32[$45>>2]|0;
   $47 = ((($16)) + 12|0);
   $48 = HEAP32[$47>>2]|0;
   $49 = ($48|0)==($16|0);
   do {
    if ($49) {
     $59 = ((($16)) + 16|0);
     $60 = ((($59)) + 4|0);
     $61 = HEAP32[$60>>2]|0;
     $62 = ($61|0)==(0|0);
     if ($62) {
      $63 = HEAP32[$59>>2]|0;
      $64 = ($63|0)==(0|0);
      if ($64) {
       $$3 = 0;
       break;
      } else {
       $$1387 = $63;$$1390 = $59;
      }
     } else {
      $$1387 = $61;$$1390 = $60;
     }
     while(1) {
      $65 = ((($$1387)) + 20|0);
      $66 = HEAP32[$65>>2]|0;
      $67 = ($66|0)==(0|0);
      if (!($67)) {
       $$1387 = $66;$$1390 = $65;
       continue;
      }
      $68 = ((($$1387)) + 16|0);
      $69 = HEAP32[$68>>2]|0;
      $70 = ($69|0)==(0|0);
      if ($70) {
       break;
      } else {
       $$1387 = $69;$$1390 = $68;
      }
     }
     $71 = ($$1390>>>0)<($3>>>0);
     if ($71) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$$1390>>2] = 0;
      $$3 = $$1387;
      break;
     }
    } else {
     $50 = ((($16)) + 8|0);
     $51 = HEAP32[$50>>2]|0;
     $52 = ($51>>>0)<($3>>>0);
     if ($52) {
      _abort();
      // unreachable;
     }
     $53 = ((($51)) + 12|0);
     $54 = HEAP32[$53>>2]|0;
     $55 = ($54|0)==($16|0);
     if (!($55)) {
      _abort();
      // unreachable;
     }
     $56 = ((($48)) + 8|0);
     $57 = HEAP32[$56>>2]|0;
     $58 = ($57|0)==($16|0);
     if ($58) {
      HEAP32[$53>>2] = $48;
      HEAP32[$56>>2] = $51;
      $$3 = $48;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $72 = ($46|0)==(0|0);
   if ($72) {
    $$1 = $16;$$1382 = $17;$113 = $16;
   } else {
    $73 = ((($16)) + 28|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = (6720 + ($74<<2)|0);
    $76 = HEAP32[$75>>2]|0;
    $77 = ($16|0)==($76|0);
    do {
     if ($77) {
      HEAP32[$75>>2] = $$3;
      $cond421 = ($$3|0)==(0|0);
      if ($cond421) {
       $78 = 1 << $74;
       $79 = $78 ^ -1;
       $80 = HEAP32[(6420)>>2]|0;
       $81 = $80 & $79;
       HEAP32[(6420)>>2] = $81;
       $$1 = $16;$$1382 = $17;$113 = $16;
       break L10;
      }
     } else {
      $82 = HEAP32[(6432)>>2]|0;
      $83 = ($46>>>0)<($82>>>0);
      if ($83) {
       _abort();
       // unreachable;
      } else {
       $84 = ((($46)) + 16|0);
       $85 = HEAP32[$84>>2]|0;
       $not$405 = ($85|0)!=($16|0);
       $$sink3 = $not$405&1;
       $86 = (((($46)) + 16|0) + ($$sink3<<2)|0);
       HEAP32[$86>>2] = $$3;
       $87 = ($$3|0)==(0|0);
       if ($87) {
        $$1 = $16;$$1382 = $17;$113 = $16;
        break L10;
       } else {
        break;
       }
      }
     }
    } while(0);
    $88 = HEAP32[(6432)>>2]|0;
    $89 = ($$3>>>0)<($88>>>0);
    if ($89) {
     _abort();
     // unreachable;
    }
    $90 = ((($$3)) + 24|0);
    HEAP32[$90>>2] = $46;
    $91 = ((($16)) + 16|0);
    $92 = HEAP32[$91>>2]|0;
    $93 = ($92|0)==(0|0);
    do {
     if (!($93)) {
      $94 = ($92>>>0)<($88>>>0);
      if ($94) {
       _abort();
       // unreachable;
      } else {
       $95 = ((($$3)) + 16|0);
       HEAP32[$95>>2] = $92;
       $96 = ((($92)) + 24|0);
       HEAP32[$96>>2] = $$3;
       break;
      }
     }
    } while(0);
    $97 = ((($91)) + 4|0);
    $98 = HEAP32[$97>>2]|0;
    $99 = ($98|0)==(0|0);
    if ($99) {
     $$1 = $16;$$1382 = $17;$113 = $16;
    } else {
     $100 = HEAP32[(6432)>>2]|0;
     $101 = ($98>>>0)<($100>>>0);
     if ($101) {
      _abort();
      // unreachable;
     } else {
      $102 = ((($$3)) + 20|0);
      HEAP32[$102>>2] = $98;
      $103 = ((($98)) + 24|0);
      HEAP32[$103>>2] = $$3;
      $$1 = $16;$$1382 = $17;$113 = $16;
      break;
     }
    }
   }
  } else {
   $$1 = $2;$$1382 = $9;$113 = $2;
  }
 } while(0);
 $112 = ($113>>>0)<($10>>>0);
 if (!($112)) {
  _abort();
  // unreachable;
 }
 $114 = ((($10)) + 4|0);
 $115 = HEAP32[$114>>2]|0;
 $116 = $115 & 1;
 $117 = ($116|0)==(0);
 if ($117) {
  _abort();
  // unreachable;
 }
 $118 = $115 & 2;
 $119 = ($118|0)==(0);
 if ($119) {
  $120 = HEAP32[(6440)>>2]|0;
  $121 = ($10|0)==($120|0);
  $122 = HEAP32[(6436)>>2]|0;
  if ($121) {
   $123 = HEAP32[(6428)>>2]|0;
   $124 = (($123) + ($$1382))|0;
   HEAP32[(6428)>>2] = $124;
   HEAP32[(6440)>>2] = $$1;
   $125 = $124 | 1;
   $126 = ((($$1)) + 4|0);
   HEAP32[$126>>2] = $125;
   $127 = ($$1|0)==($122|0);
   if (!($127)) {
    return;
   }
   HEAP32[(6436)>>2] = 0;
   HEAP32[(6424)>>2] = 0;
   return;
  }
  $128 = ($10|0)==($122|0);
  if ($128) {
   $129 = HEAP32[(6424)>>2]|0;
   $130 = (($129) + ($$1382))|0;
   HEAP32[(6424)>>2] = $130;
   HEAP32[(6436)>>2] = $113;
   $131 = $130 | 1;
   $132 = ((($$1)) + 4|0);
   HEAP32[$132>>2] = $131;
   $133 = (($113) + ($130)|0);
   HEAP32[$133>>2] = $130;
   return;
  }
  $134 = $115 & -8;
  $135 = (($134) + ($$1382))|0;
  $136 = $115 >>> 3;
  $137 = ($115>>>0)<(256);
  L108: do {
   if ($137) {
    $138 = ((($10)) + 8|0);
    $139 = HEAP32[$138>>2]|0;
    $140 = ((($10)) + 12|0);
    $141 = HEAP32[$140>>2]|0;
    $142 = $136 << 1;
    $143 = (6456 + ($142<<2)|0);
    $144 = ($139|0)==($143|0);
    if (!($144)) {
     $145 = HEAP32[(6432)>>2]|0;
     $146 = ($139>>>0)<($145>>>0);
     if ($146) {
      _abort();
      // unreachable;
     }
     $147 = ((($139)) + 12|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($148|0)==($10|0);
     if (!($149)) {
      _abort();
      // unreachable;
     }
    }
    $150 = ($141|0)==($139|0);
    if ($150) {
     $151 = 1 << $136;
     $152 = $151 ^ -1;
     $153 = HEAP32[1604]|0;
     $154 = $153 & $152;
     HEAP32[1604] = $154;
     break;
    }
    $155 = ($141|0)==($143|0);
    if ($155) {
     $$pre442 = ((($141)) + 8|0);
     $$pre$phi443Z2D = $$pre442;
    } else {
     $156 = HEAP32[(6432)>>2]|0;
     $157 = ($141>>>0)<($156>>>0);
     if ($157) {
      _abort();
      // unreachable;
     }
     $158 = ((($141)) + 8|0);
     $159 = HEAP32[$158>>2]|0;
     $160 = ($159|0)==($10|0);
     if ($160) {
      $$pre$phi443Z2D = $158;
     } else {
      _abort();
      // unreachable;
     }
    }
    $161 = ((($139)) + 12|0);
    HEAP32[$161>>2] = $141;
    HEAP32[$$pre$phi443Z2D>>2] = $139;
   } else {
    $162 = ((($10)) + 24|0);
    $163 = HEAP32[$162>>2]|0;
    $164 = ((($10)) + 12|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ($165|0)==($10|0);
    do {
     if ($166) {
      $177 = ((($10)) + 16|0);
      $178 = ((($177)) + 4|0);
      $179 = HEAP32[$178>>2]|0;
      $180 = ($179|0)==(0|0);
      if ($180) {
       $181 = HEAP32[$177>>2]|0;
       $182 = ($181|0)==(0|0);
       if ($182) {
        $$3400 = 0;
        break;
       } else {
        $$1398 = $181;$$1402 = $177;
       }
      } else {
       $$1398 = $179;$$1402 = $178;
      }
      while(1) {
       $183 = ((($$1398)) + 20|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = ($184|0)==(0|0);
       if (!($185)) {
        $$1398 = $184;$$1402 = $183;
        continue;
       }
       $186 = ((($$1398)) + 16|0);
       $187 = HEAP32[$186>>2]|0;
       $188 = ($187|0)==(0|0);
       if ($188) {
        break;
       } else {
        $$1398 = $187;$$1402 = $186;
       }
      }
      $189 = HEAP32[(6432)>>2]|0;
      $190 = ($$1402>>>0)<($189>>>0);
      if ($190) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$1402>>2] = 0;
       $$3400 = $$1398;
       break;
      }
     } else {
      $167 = ((($10)) + 8|0);
      $168 = HEAP32[$167>>2]|0;
      $169 = HEAP32[(6432)>>2]|0;
      $170 = ($168>>>0)<($169>>>0);
      if ($170) {
       _abort();
       // unreachable;
      }
      $171 = ((($168)) + 12|0);
      $172 = HEAP32[$171>>2]|0;
      $173 = ($172|0)==($10|0);
      if (!($173)) {
       _abort();
       // unreachable;
      }
      $174 = ((($165)) + 8|0);
      $175 = HEAP32[$174>>2]|0;
      $176 = ($175|0)==($10|0);
      if ($176) {
       HEAP32[$171>>2] = $165;
       HEAP32[$174>>2] = $168;
       $$3400 = $165;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $191 = ($163|0)==(0|0);
    if (!($191)) {
     $192 = ((($10)) + 28|0);
     $193 = HEAP32[$192>>2]|0;
     $194 = (6720 + ($193<<2)|0);
     $195 = HEAP32[$194>>2]|0;
     $196 = ($10|0)==($195|0);
     do {
      if ($196) {
       HEAP32[$194>>2] = $$3400;
       $cond422 = ($$3400|0)==(0|0);
       if ($cond422) {
        $197 = 1 << $193;
        $198 = $197 ^ -1;
        $199 = HEAP32[(6420)>>2]|0;
        $200 = $199 & $198;
        HEAP32[(6420)>>2] = $200;
        break L108;
       }
      } else {
       $201 = HEAP32[(6432)>>2]|0;
       $202 = ($163>>>0)<($201>>>0);
       if ($202) {
        _abort();
        // unreachable;
       } else {
        $203 = ((($163)) + 16|0);
        $204 = HEAP32[$203>>2]|0;
        $not$ = ($204|0)!=($10|0);
        $$sink5 = $not$&1;
        $205 = (((($163)) + 16|0) + ($$sink5<<2)|0);
        HEAP32[$205>>2] = $$3400;
        $206 = ($$3400|0)==(0|0);
        if ($206) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while(0);
     $207 = HEAP32[(6432)>>2]|0;
     $208 = ($$3400>>>0)<($207>>>0);
     if ($208) {
      _abort();
      // unreachable;
     }
     $209 = ((($$3400)) + 24|0);
     HEAP32[$209>>2] = $163;
     $210 = ((($10)) + 16|0);
     $211 = HEAP32[$210>>2]|0;
     $212 = ($211|0)==(0|0);
     do {
      if (!($212)) {
       $213 = ($211>>>0)<($207>>>0);
       if ($213) {
        _abort();
        // unreachable;
       } else {
        $214 = ((($$3400)) + 16|0);
        HEAP32[$214>>2] = $211;
        $215 = ((($211)) + 24|0);
        HEAP32[$215>>2] = $$3400;
        break;
       }
      }
     } while(0);
     $216 = ((($210)) + 4|0);
     $217 = HEAP32[$216>>2]|0;
     $218 = ($217|0)==(0|0);
     if (!($218)) {
      $219 = HEAP32[(6432)>>2]|0;
      $220 = ($217>>>0)<($219>>>0);
      if ($220) {
       _abort();
       // unreachable;
      } else {
       $221 = ((($$3400)) + 20|0);
       HEAP32[$221>>2] = $217;
       $222 = ((($217)) + 24|0);
       HEAP32[$222>>2] = $$3400;
       break;
      }
     }
    }
   }
  } while(0);
  $223 = $135 | 1;
  $224 = ((($$1)) + 4|0);
  HEAP32[$224>>2] = $223;
  $225 = (($113) + ($135)|0);
  HEAP32[$225>>2] = $135;
  $226 = HEAP32[(6436)>>2]|0;
  $227 = ($$1|0)==($226|0);
  if ($227) {
   HEAP32[(6424)>>2] = $135;
   return;
  } else {
   $$2 = $135;
  }
 } else {
  $228 = $115 & -2;
  HEAP32[$114>>2] = $228;
  $229 = $$1382 | 1;
  $230 = ((($$1)) + 4|0);
  HEAP32[$230>>2] = $229;
  $231 = (($113) + ($$1382)|0);
  HEAP32[$231>>2] = $$1382;
  $$2 = $$1382;
 }
 $232 = $$2 >>> 3;
 $233 = ($$2>>>0)<(256);
 if ($233) {
  $234 = $232 << 1;
  $235 = (6456 + ($234<<2)|0);
  $236 = HEAP32[1604]|0;
  $237 = 1 << $232;
  $238 = $236 & $237;
  $239 = ($238|0)==(0);
  if ($239) {
   $240 = $236 | $237;
   HEAP32[1604] = $240;
   $$pre = ((($235)) + 8|0);
   $$0403 = $235;$$pre$phiZ2D = $$pre;
  } else {
   $241 = ((($235)) + 8|0);
   $242 = HEAP32[$241>>2]|0;
   $243 = HEAP32[(6432)>>2]|0;
   $244 = ($242>>>0)<($243>>>0);
   if ($244) {
    _abort();
    // unreachable;
   } else {
    $$0403 = $242;$$pre$phiZ2D = $241;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $245 = ((($$0403)) + 12|0);
  HEAP32[$245>>2] = $$1;
  $246 = ((($$1)) + 8|0);
  HEAP32[$246>>2] = $$0403;
  $247 = ((($$1)) + 12|0);
  HEAP32[$247>>2] = $235;
  return;
 }
 $248 = $$2 >>> 8;
 $249 = ($248|0)==(0);
 if ($249) {
  $$0396 = 0;
 } else {
  $250 = ($$2>>>0)>(16777215);
  if ($250) {
   $$0396 = 31;
  } else {
   $251 = (($248) + 1048320)|0;
   $252 = $251 >>> 16;
   $253 = $252 & 8;
   $254 = $248 << $253;
   $255 = (($254) + 520192)|0;
   $256 = $255 >>> 16;
   $257 = $256 & 4;
   $258 = $257 | $253;
   $259 = $254 << $257;
   $260 = (($259) + 245760)|0;
   $261 = $260 >>> 16;
   $262 = $261 & 2;
   $263 = $258 | $262;
   $264 = (14 - ($263))|0;
   $265 = $259 << $262;
   $266 = $265 >>> 15;
   $267 = (($264) + ($266))|0;
   $268 = $267 << 1;
   $269 = (($267) + 7)|0;
   $270 = $$2 >>> $269;
   $271 = $270 & 1;
   $272 = $271 | $268;
   $$0396 = $272;
  }
 }
 $273 = (6720 + ($$0396<<2)|0);
 $274 = ((($$1)) + 28|0);
 HEAP32[$274>>2] = $$0396;
 $275 = ((($$1)) + 16|0);
 $276 = ((($$1)) + 20|0);
 HEAP32[$276>>2] = 0;
 HEAP32[$275>>2] = 0;
 $277 = HEAP32[(6420)>>2]|0;
 $278 = 1 << $$0396;
 $279 = $277 & $278;
 $280 = ($279|0)==(0);
 do {
  if ($280) {
   $281 = $277 | $278;
   HEAP32[(6420)>>2] = $281;
   HEAP32[$273>>2] = $$1;
   $282 = ((($$1)) + 24|0);
   HEAP32[$282>>2] = $273;
   $283 = ((($$1)) + 12|0);
   HEAP32[$283>>2] = $$1;
   $284 = ((($$1)) + 8|0);
   HEAP32[$284>>2] = $$1;
  } else {
   $285 = HEAP32[$273>>2]|0;
   $286 = ($$0396|0)==(31);
   $287 = $$0396 >>> 1;
   $288 = (25 - ($287))|0;
   $289 = $286 ? 0 : $288;
   $290 = $$2 << $289;
   $$0383 = $290;$$0384 = $285;
   while(1) {
    $291 = ((($$0384)) + 4|0);
    $292 = HEAP32[$291>>2]|0;
    $293 = $292 & -8;
    $294 = ($293|0)==($$2|0);
    if ($294) {
     label = 124;
     break;
    }
    $295 = $$0383 >>> 31;
    $296 = (((($$0384)) + 16|0) + ($295<<2)|0);
    $297 = $$0383 << 1;
    $298 = HEAP32[$296>>2]|0;
    $299 = ($298|0)==(0|0);
    if ($299) {
     label = 121;
     break;
    } else {
     $$0383 = $297;$$0384 = $298;
    }
   }
   if ((label|0) == 121) {
    $300 = HEAP32[(6432)>>2]|0;
    $301 = ($296>>>0)<($300>>>0);
    if ($301) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$296>>2] = $$1;
     $302 = ((($$1)) + 24|0);
     HEAP32[$302>>2] = $$0384;
     $303 = ((($$1)) + 12|0);
     HEAP32[$303>>2] = $$1;
     $304 = ((($$1)) + 8|0);
     HEAP32[$304>>2] = $$1;
     break;
    }
   }
   else if ((label|0) == 124) {
    $305 = ((($$0384)) + 8|0);
    $306 = HEAP32[$305>>2]|0;
    $307 = HEAP32[(6432)>>2]|0;
    $308 = ($306>>>0)>=($307>>>0);
    $not$437 = ($$0384>>>0)>=($307>>>0);
    $309 = $308 & $not$437;
    if ($309) {
     $310 = ((($306)) + 12|0);
     HEAP32[$310>>2] = $$1;
     HEAP32[$305>>2] = $$1;
     $311 = ((($$1)) + 8|0);
     HEAP32[$311>>2] = $306;
     $312 = ((($$1)) + 12|0);
     HEAP32[$312>>2] = $$0384;
     $313 = ((($$1)) + 24|0);
     HEAP32[$313>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $314 = HEAP32[(6448)>>2]|0;
 $315 = (($314) + -1)|0;
 HEAP32[(6448)>>2] = $315;
 $316 = ($315|0)==(0);
 if ($316) {
  $$0212$in$i = (6872);
 } else {
  return;
 }
 while(1) {
  $$0212$i = HEAP32[$$0212$in$i>>2]|0;
  $317 = ($$0212$i|0)==(0|0);
  $318 = ((($$0212$i)) + 8|0);
  if ($317) {
   break;
  } else {
   $$0212$in$i = $318;
  }
 }
 HEAP32[(6448)>>2] = -1;
 return;
}
function runPostSets() {
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        ___setErrNo(12);
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        return -1;
      }
    }
    return oldDynamicTop|0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}

  
function dynCall_iiiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0; a7=a7|0;
  return FUNCTION_TABLE_iiiiiiii[index&15](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0,a7|0)|0;
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&31](a1|0,a2|0,a3|0)|0;
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&15](a1|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&15](a1|0)|0;
}


function dynCall_viiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0; a7=a7|0;
  FUNCTION_TABLE_viiiiiii[index&15](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0,a7|0);
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&7]();
}


function dynCall_iiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0; a7=a7|0; a8=a8|0;
  return FUNCTION_TABLE_iiiiiiiii[index&15](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0,a7|0,a8|0)|0;
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&15](a1|0,a2|0)|0;
}

function b0(p0,p1,p2,p3,p4,p5,p6) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0; nullFunc_iiiiiiii(0);return 0;
}
function b1(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(1);return 0;
}
function b2(p0) {
 p0 = p0|0; nullFunc_vi(2);
}
function b3(p0) {
 p0 = p0|0; nullFunc_ii(3);return 0;
}
function b4(p0,p1,p2,p3,p4,p5,p6) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0; nullFunc_viiiiiii(4);
}
function b5() {
 ; nullFunc_v(5);
}
function b6(p0,p1,p2,p3,p4,p5,p6,p7) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0;p7 = p7|0; nullFunc_iiiiiiiii(6);return 0;
}
function b7(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(7);return 0;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiiiiiii = [b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,_WebRtcSpl_ScaleAndAddVectorsWithRoundC,b0,b0];
var FUNCTION_TABLE_iiii = [b1,b1,___stdout_write,___stdio_seek,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,_WebRtcSpl_RealForwardFFTC,_WebRtcSpl_RealInverseFFTC,___stdio_write,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1];
var FUNCTION_TABLE_vi = [b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,_WebRtcSpl_FreeRealFFTC];
var FUNCTION_TABLE_ii = [b3,___stdio_close,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,_WebRtcSpl_CreateRealFFTC,b3];
var FUNCTION_TABLE_viiiiiii = [b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,_WebRtcSpl_CrossCorrelationC,b4,b4,b4,b4];
var FUNCTION_TABLE_v = [b5,b5,b5,b5,_InitFunctionPointers,b5,b5,b5];
var FUNCTION_TABLE_iiiiiiiii = [b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,_WebRtcSpl_DownsampleFastC,b6,b6,b6];
var FUNCTION_TABLE_iii = [b7,b7,b7,b7,b7,_WebRtcSpl_MaxAbsValueW16C,_WebRtcSpl_MaxAbsValueW32C,_WebRtcSpl_MaxValueW16C,_WebRtcSpl_MaxValueW32C,_WebRtcSpl_MinValueW16C,_WebRtcSpl_MinValueW32C,b7,b7,b7,b7,b7];

  return { _sbrk: _sbrk, _i64Subtract: _i64Subtract, _fflush: _fflush, _main: _main, _process_data: _process_data, _memset: _memset, _llvm_cttz_i32: _llvm_cttz_i32, _malloc: _malloc, _i64Add: _i64Add, _emscripten_get_global_libc: _emscripten_get_global_libc, _memcpy: _memcpy, _setmode: _setmode, _llvm_bswap_i32: _llvm_bswap_i32, _bitshift64Shl: _bitshift64Shl, _bitshift64Lshr: _bitshift64Lshr, _free: _free, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, ___errno_location: ___errno_location, ___udivmoddi4: ___udivmoddi4, runPostSets: runPostSets, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setTempRet0: setTempRet0, getTempRet0: getTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_iiiiiiii: dynCall_iiiiiiii, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_ii: dynCall_ii, dynCall_viiiiiii: dynCall_viiiiiii, dynCall_v: dynCall_v, dynCall_iiiiiiiii: dynCall_iiiiiiiii, dynCall_iii: dynCall_iii };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__llvm_bswap_i32.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__main.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackSave.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_getTempRet0.apply(null, arguments);
};

var real__llvm_cttz_i32 = asm["_llvm_cttz_i32"]; asm["_llvm_cttz_i32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__llvm_cttz_i32.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_setThrew.apply(null, arguments);
};

var real__setmode = asm["_setmode"]; asm["_setmode"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__setmode.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Shl.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__sbrk.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackAlloc.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____uremdi3.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Subtract.apply(null, arguments);
};

var real____udivmoddi4 = asm["___udivmoddi4"]; asm["___udivmoddi4"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivmoddi4.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_setTempRet0.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Add.apply(null, arguments);
};

var real__emscripten_get_global_libc = asm["_emscripten_get_global_libc"]; asm["_emscripten_get_global_libc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_get_global_libc.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivdi3.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real__process_data = asm["_process_data"]; asm["_process_data"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__process_data.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackRestore.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_establishStackSpace.apply(null, arguments);
};
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _main = Module["_main"] = asm["_main"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var _llvm_cttz_i32 = Module["_llvm_cttz_i32"] = asm["_llvm_cttz_i32"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var _setmode = Module["_setmode"] = asm["_setmode"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var ___udivmoddi4 = Module["___udivmoddi4"] = asm["___udivmoddi4"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _emscripten_get_global_libc = Module["_emscripten_get_global_libc"] = asm["_emscripten_get_global_libc"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var _free = Module["_free"] = asm["_free"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _process_data = Module["_process_data"] = asm["_process_data"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var dynCall_iiiiiiii = Module["dynCall_iiiiiiii"] = asm["dynCall_iiiiiiii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = asm["dynCall_viiiiiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_iiiiiiiii = Module["dynCall_iiiiiiiii"] = asm["dynCall_iiiiiiiii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
;

Runtime.stackAlloc = Module['stackAlloc'];
Runtime.stackSave = Module['stackSave'];
Runtime.stackRestore = Module['stackRestore'];
Runtime.establishStackSpace = Module['establishStackSpace'];

Runtime.setTempRet0 = Module['setTempRet0'];
Runtime.getTempRet0 = Module['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;





function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



