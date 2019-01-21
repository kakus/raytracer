/// <reference path="../core/mesh.ts" />

function qu_load_obj(file: string) {
    let lines = file.split('\n');
    let vertex = [];
    let indices = [];

    for (let line of lines) {
        let tokens = line.split(/ +/);
        let type   = tokens.shift();
        if (type == 'v') {
            qu_assert(tokens.length === 3);
            vertex.push(...tokens.map(t => parseFloat(t)));
        } else if (type == 'f') {
            qu_assert(tokens.length === 3);
            for (let idx of tokens.map(t => parseInt(t) - 1)) {
                qu_assert(idx >= 0 && idx < vertex.length);
                qu_assert(idx < 2**16);
                indices.push(idx);
            }
        }
    }

    let mesh = new qr_webgl_mesh();
    mesh.set_vertex_buffer('vertex', 3, vertex);
    mesh.set_index_buffer('triangles', indices);
    return mesh;
}