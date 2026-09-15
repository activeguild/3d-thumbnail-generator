/**
 * Manual mikktspace WASM loader.
 * Fetches the WASM binary from /mikktspace.wasm and instantiates it,
 * bypassing webpack's asyncWebAssembly which has timing issues with wasm-bindgen.
 */

let wasmInstance = null;

async function initWasm() {
  if (wasmInstance) return wasmInstance;

  const response = await fetch('/mikktspace.wasm');
  const bytes = await response.arrayBuffer();

  const heap = new Array(32).fill(undefined);
  heap.push(undefined, null, true, false);
  let heap_next = heap.length;

  function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
  }

  function getObject(idx) { return heap[idx]; }

  function dropObject(idx) {
    if (idx < 36) return;
    heap[idx] = heap_next;
    heap_next = idx;
  }

  function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
  }

  const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

  const imports = {
    './mikktspace_module_bg.js': {
      __wbindgen_string_new(arg0, arg1) {
        const mem = new Uint8Array(wasm.memory.buffer);
        const ret = decoder.decode(mem.subarray(arg0, arg0 + arg1));
        return addHeapObject(ret);
      },
      __wbindgen_rethrow(arg0) {
        throw takeObject(arg0);
      },
    },
  };

  const result = await WebAssembly.instantiate(bytes, imports);
  wasmInstance = result.instance.exports;
  return wasmInstance;
}

/**
 * Load and return the generateTangents function from mikktspace WASM.
 */
export async function loadGenerateTangents() {
  const wasm = await initWasm();

  return function generateTangents(position, normal, texcoord) {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    try {
      const ptr0 = wasm.__wbindgen_malloc(position.length * 4);
      new Float32Array(wasm.memory.buffer, ptr0, position.length).set(position);
      const len0 = position.length;

      const ptr1 = wasm.__wbindgen_malloc(normal.length * 4);
      new Float32Array(wasm.memory.buffer, ptr1, normal.length).set(normal);
      const len1 = normal.length;

      const ptr2 = wasm.__wbindgen_malloc(texcoord.length * 4);
      new Float32Array(wasm.memory.buffer, ptr2, texcoord.length).set(texcoord);
      const len2 = texcoord.length;

      wasm.generateTangents(retptr, ptr0, len0, ptr1, len1, ptr2, len2);

      const i32 = new Int32Array(wasm.memory.buffer);
      const r0 = i32[retptr / 4 + 0];
      const r1 = i32[retptr / 4 + 1];
      const result = new Float32Array(wasm.memory.buffer, r0, r1).slice();
      wasm.__wbindgen_free(r0, r1 * 4);
      return result;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  };
}
