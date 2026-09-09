declare module 'sql.js/dist/sql-wasm-browser.js' {
  const initialize:(options:{locateFile?:(name:string)=>string;wasmBinary?:Uint8Array})=>Promise<import('./sqlite-reader').SqlJsRuntime>;
  export default initialize;
}
