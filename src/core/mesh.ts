/// <reference path="../utils/utils.ts" />

class qr_webgl_buffer {

    public buffer: WebGLBuffer;

    constructor(
        readonly target: number,
        readonly type: number,
        readonly element_size: number,
        public data?: Float32Array | Uint16Array
    ) { }

    get_element_size() {
        return this.element_size;
    }

    num() {
        return this.data.length / this.get_element_size();
    }

    bind_and_upload(gl: WebGLRenderingContext) {
        let buffer = this.buffer || gl.createBuffer();
        gl.bindBuffer(this.target, buffer);
        if (!this.buffer) {
            this.buffer = buffer;
            gl.bufferData(this.target, this.data, this.type);
        }
    }
}

class qr_webgl_mesh {
    vertex_buffers: {[attribute:string]: qr_webgl_buffer} = {};
    index_buffers:  {[attribute:string]: qr_webgl_buffer} = {};

    set_vertex_buffer(attribute: string, element_size: number, data?: number[]) {
        qu_assert(element_size > 0);

        let buffer = this.vertex_buffers[attribute];
        if (!buffer) {
            buffer = this.vertex_buffers[attribute] = new qr_webgl_buffer(egl.ARRAY_BUFFER, egl.STATIC_DRAW, element_size);
        }

        if (data) {
            qu_assert(data.length > element_size);
            qu_assert(Number.isInteger(data.length / element_size));
            buffer.data = new Float32Array(data);
        }
    }

    set_index_buffer(name: string, data: number[]) {
        qu_assert(data.length > 0);

        let buffer = this.index_buffers[name];
        if (!buffer) {
            buffer = this.index_buffers[name] = new qr_webgl_buffer(egl.ELEMENT_ARRAY_BUFFER, egl.STATIC_DRAW, 1);
        }

        buffer.data = new Uint16Array(data);

        if (name === 'triangles') {
            this.make_lines_from_triangles();
        }
    }

    make_lines_from_triangles() {
        if (this.index_buffers.lines) {
            return;
        }

        const tr = this.index_buffers.triangles.data;
        qu_assert(Number.isInteger(tr.length / 3));

        let lines = [];
        for (let i = 2; i < tr.length; i += 3) {
            lines.push(tr[i - 2], tr[i - 1], tr[i - 1], tr[i], tr[i], tr[i - 2]);
        }

        this.set_index_buffer('lines', lines);
    }

    static make_triangle() {
        let mesh = new qr_webgl_mesh();
        mesh.set_vertex_buffer('vertex', 3, [0, 1, 0, 0, 0, 0, 1, 0, 0]);
        mesh.set_index_buffer('triangles', [0, 1, 2]);
        return mesh;
    }

    static make_cube() {
        let mesh = new qr_webgl_mesh();

        mesh.set_vertex_buffer('vertex', 3, [
            // front
            -1.0, -1.0,  1.0,
            1.0, -1.0,  1.0,
            1.0,  1.0,  1.0,
            -1.0,  1.0,  1.0,
            // back
            -1.0, -1.0, -1.0,
            1.0, -1.0, -1.0,
            1.0,  1.0, -1.0,
            -1.0,  1.0, -1.0]);

        mesh.set_index_buffer('triangles', [
          	// front
            0, 1, 2,
            2, 3, 0,
            // right
            1, 5, 6,
            6, 2, 1,
            // back
            7, 6, 5,
            5, 4, 7,
            // left
            4, 0, 3,
            3, 7, 4,
            // bottom
            4, 5, 1,
            1, 0, 4,
            // top
            3, 2, 6,
            6, 7, 3]);

        return mesh;
    }

    static make_quad(): qr_webgl_mesh {
        let mesh = new qr_webgl_mesh();
        mesh.set_vertex_buffer('vertex', 3, [
            -1, -1, 0,
            -1,  1, 0,
             1, -1, 0,
             1,  1, 0
        ]);
        mesh.set_index_buffer('triangles', [
            0, 1, 2,
            1, 2, 3
        ]);
        return mesh;
    }
}

class qr_webgl_shader {
    attrib_location: {[attrib:string]: number} = {};
    uniforms: {[uniform:string]: Float32Array | Uint16Array } = {};
    uniforms_locations: {[key:string]: WebGLUniformLocation} = {};

    constructor(
        private gl: WebGLRenderingContext,
        private program: WebGLProgram
    ) { 
        this.uniforms.model = mat4.create();
        this.uniforms.projection = mat4.perspective(mat4.create(), Math.PI/4, 2, 1, 2000);
        this.uniforms.view = mat4.fromRotationTranslation(mat4.create(),
            quat.setAxisAngle(quat.create(), [0, 0, 1], 0),
            vec3.fromValues(0, 0, -3));
        //mat4.invert(this.uniforms.view, this.uniforms.view);
    }

    draw_mesh(mesh: qr_webgl_mesh, draw_type: 'triangles' | 'lines' = 'triangles') {
        this.draw_buffer(mesh.vertex_buffers, 
            mesh.index_buffers[draw_type], 
            draw_type == 'triangles' ? egl.TRIANGLES : egl.LINES);
    }

    set_uniformf(name: string, data: number[]) {
        this.uniforms[name] = new Float32Array(data);
    }

    set_uniforms() {
        const gl = this.gl;

        for (let uniform_name in this.uniforms) {
            let location = this.uniforms_locations[uniform_name] || gl.getUniformLocation(this.program, uniform_name);
            if (location == -1) {
                throw new Error(`failed to find uniform ${uniform_name} location.`);
            }
            this.uniforms_locations[uniform_name] = location;

            let uniform = this.uniforms[uniform_name];
            if (uniform instanceof Float32Array) {
                if (uniform.length <= 4) {
                    gl[`uniform${uniform.length}fv`](location, uniform);
                } else {
                    gl[`uniformMatrix${uniform.length/4}fv`](location, false, uniform);
                }
            } else {
                throw new Error(`unsupported`);
            }
        }
    }

    set_vertex_attributes(buffers: {[key:string]: qr_webgl_buffer}) {
        const gl = this.gl;
        for (let attribute in buffers) {
            let buffer   = buffers[attribute];
            let location = this.attrib_location[attribute];

            if (!location) {
                location = this.attrib_location[attribute] = gl.getAttribLocation(this.program, attribute);
            }
            if (location == undefined || location == -1) {
                throw new Error(`Missing location for attribute ${attribute}`);
            }

            buffer.bind_and_upload(gl);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, buffer.get_element_size(), egl.FLOAT, false, 0, 0);
        } 
    }

    draw_buffer(vertex_buffers: { [key: string]: qr_webgl_buffer }, index_buffer: qr_webgl_buffer, mode: number) {
        const gl = this.gl;
        const vertex_num = vertex_buffers.vertex.num();

        gl.useProgram(this.program);
        this.set_uniforms();
        this.set_vertex_attributes(vertex_buffers);

        if (index_buffer) {
            index_buffer.bind_and_upload(gl);
            gl.drawElements(mode, index_buffer.data.length, egl.UNSIGNED_SHORT, 0);
        } else {
            gl.drawArrays(mode, 0, vertex_num);
        }
    }
}