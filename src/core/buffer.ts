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