/**
 * Manual mikktspace WASM loader.
 * Fetches the WASM binary from /mikktspace.wasm and instantiates it,
 * bypassing webpack's asyncWebAssembly which has timing issues with wasm-bindgen.
 */

let cachedGenerateTangents = null;

export async function loadGenerateTangents() {
  if (cachedGenerateTangents) return cachedGenerateTangents;

  const response = await fetch('/mikktspace.wasm');
  const bytes = await response.arrayBuffer();

  // wasm-bindgen heap management
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

  function takeObject(idx) {
    const ret = heap[idx];
    if (idx < 36) return ret;
    heap[idx] = heap_next;
    heap_next = idx;
    return ret;
  }

  const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

  // Mutable reference — assigned after instantiation, but before any
  // exported function is called (imports are only invoked from exports).
  let wasm;

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
  wasm = result.instance.exports;

  cachedGenerateTangents = function generateTangents(position, normal, texcoord) {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    try {
      const ptr0 = wasm.__wbindgen_malloc(position.length * 4);
      new Float32Array(wasm.memory.buffer, ptr0, position.length).set(position);

      const ptr1 = wasm.__wbindgen_malloc(normal.length * 4);
      new Float32Array(wasm.memory.buffer, ptr1, normal.length).set(normal);

      const ptr2 = wasm.__wbindgen_malloc(texcoord.length * 4);
      new Float32Array(wasm.memory.buffer, ptr2, texcoord.length).set(texcoord);

      wasm.generateTangents(retptr, ptr0, position.length, ptr1, normal.length, ptr2, texcoord.length);

      const i32 = new Int32Array(wasm.memory.buffer);
      const r0 = i32[retptr / 4 + 0];
      const r1 = i32[retptr / 4 + 1];
      const tangentData = new Float32Array(wasm.memory.buffer, r0, r1).slice();
      wasm.__wbindgen_free(r0, r1 * 4);
      return tangentData;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  };

  return cachedGenerateTangents;
}
