/// <reference path="../types/WebGLTypes.d.ts" />
/// <reference path="../utils/utils.ts" />
/// <reference path="buffer.ts" />

class qu_texture {
    id: WebGLTexture;
    frame_buffer: WebGLFramebuffer;
    render_buffer: WebGLRenderbuffer;

    constructor(
        protected gl: WebGLRenderingContext,
        protected width: number,
        protected height: number,
        {
            format = egl.RGBA,
            type   = egl.UNSIGNED_BYTE,
            filter = egl.LINEAR,
            wrap   = egl.REPEAT,
            data   = null
        }
    ) { 
        qu_assert(gl != undefined);
        qu_assert(width > 0 && height > 0);
        // if (data) {
        //     qu_assert(data.length === width * height * 4);
        // }

        this.id = gl.createTexture();
        gl.bindTexture(egl.TEXTURE_2D, this.id);
        gl.texParameteri(egl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(egl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(egl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(egl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        if (!data || data instanceof Array) {
            gl.texImage2D(egl.TEXTURE_2D, 0, format, width, height, 0, format, type, new Float32Array(data));
        } else {
            gl.texImage2D(egl.TEXTURE_2D, 0, format, format, type, data);
        }
    }

    destroy(gl: WebGLRenderingContext) {
        qu_assert(this.id != undefined);
        gl.deleteTexture(this.id);
        this.id = undefined;
    }

    bind(unit = 0) { 
        this.gl.activeTexture(egl.TEXTURE0 + unit);
        this.gl.bindTexture(egl.TEXTURE_2D, this.id);
    }

    unbind(unit = 0) {
        this.gl.activeTexture(egl.TEXTURE0 + unit);
        this.gl.bindTexture(egl.TEXTURE_2D, null);
    }

    static from_image(gl: WebGLRenderingContext, img: HTMLImageElement | HTMLCanvasElement, options) {
        options.data = img;
        return new qu_texture(gl, img.width, img.height, options);
    }

    paint(render_commands: Function) {
        const gl = this.gl;
        const viewport = gl.getParameter(egl.VIEWPORT);
        this.frame_buffer = this.frame_buffer || gl.createFramebuffer();
        gl.bindFramebuffer(egl.FRAMEBUFFER, this.frame_buffer);
        // this.render_buffer = this.render_buffer || gl.createRenderbuffer();
        gl.framebufferTexture2D(egl.FRAMEBUFFER, egl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.id, 0);

        if (gl.checkFramebufferStatus(egl.FRAMEBUFFER) != egl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`Rendering to this texture isn't possible`);
        }

        gl.viewport(0, 0, this.width, this.height);

        render_commands();

        gl.bindFramebuffer(egl.FRAMEBUFFER, null);
        gl.viewport.apply(gl, viewport);
    }

}