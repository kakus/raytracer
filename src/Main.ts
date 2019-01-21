/// <reference path="utils/utils.ts" />
/// <reference path="types/WebGLTypes.d.ts" />
/// <reference path="math/mat4.ts" />
/// <reference path="math/vec4.ts" />
/// <reference path="math/quat.ts" />
/// <reference path="core/mesh.ts" />
/// <reference path="loaders/obj-loader.ts" />



class qu_delegate {
    private listeners: Function[] = [];
    bind(callback: Function) {
        this.listeners.push(callback);
    }
    broadcast(...payload: any) {
        for (let listener of this.listeners) {
            listener(...payload);
        }
    }
}

class qu_attribute<T> {
    static attribute_list: qu_attribute<any>[] = [];
    static on_new_attribute_event: Function;

    public on_attribute_change_delegate = new qu_delegate();

    constructor(
        private value: T,
        private outer: any
    ) {
        qu_attribute.attribute_list.push(this);
        if (qu_attribute.on_new_attribute_event) {
            setTimeout(qu_attribute.on_new_attribute_event.bind(undefined, this), 0);
        }
    }

    get_value() { 
        return this.value;
    }
    set_value(in_value: T) { 
        this.value = in_value; 
        this.on_attribute_change_delegate.broadcast(this); 
        return this.value;
     }
    alter(fn: (val: T) => T) {
        return this.set_value(fn(this.value));
    }
    get_outer() { return this.outer; }
    get_name() {
        let outer_name = this.outer.constructor.name;
        for (let prop in this.outer) {
            if (this.outer[prop] === this) return `${outer_name}.${prop}`;
        }
        return `${outer_name}.unknow`;
    }
}

class qu_debug_explorer {

    root: HTMLDivElement;

    constructor() {
        this.root = document.createElement('div');
        this.root.classList.add('debug-root');
        document.body.append(this.root);
        qu_attribute.on_new_attribute_event = this.on_new_attribute.bind(this);
    }
    
    on_new_attribute(attribute: qu_attribute<any>) {
        let widget = document.createElement('div');
        widget.classList.add('debug-attribute');
        this.root.append(widget);
        attribute.on_attribute_change_delegate.bind(
            this.on_attribute_changed.bind(this, widget));
        this.on_attribute_changed(widget, attribute);
    }

    on_attribute_changed(widget: HTMLDivElement, attribute: qu_attribute<any>) {
        if (typeof attribute.get_value() === 'boolean') {
            let input = document.createElement('input');
            input.type = 'checkbox';
            input.onchange = () => attribute.set_value(input.checked);
            input.checked = attribute.get_value();
            input.classList.add('attribute-value');
            widget.innerHTML = `<div class='attribute-name'>${attribute.get_name()}</div>`;
            widget.append(input);
        } else if (typeof attribute.get_value() === 'number') {
            let val = attribute.get_value();
            let is_int = Number.isInteger(val);
            let input = document.createElement('input');
            input.type = 'text';
            input.onchange = () => attribute.set_value(parseFloat(input.value));
            input.value = is_int ? val.toString() : val.toFixed(3);
            input.classList.add('attribute-value');
            widget.innerHTML = `<div class='attribute-name'>${attribute.get_name()}</div>`;
            widget.append(input);
        } else if (typeof attribute.get_value() === 'string') {
            let input = document.createElement('input');
            input.type = 'text';
            input.onchange = () => attribute.set_value(input.value);
            input.value = attribute.get_value();
            input.classList.add('attribute-value');
            widget.innerHTML = `<div class='attribute-name'>${attribute.get_name()}</div>`;
            widget.append(input);
        } else {
            widget.innerText = 
                `${attribute.get_name()}: ${attribute.get_value()}`;
        }
    }
}





class qr_webgl_canvas {

    canvas: HTMLCanvasElement;
    gl: WebGLRenderingContext;

    constructor(canvas_id: string) {
        this.canvas = document.querySelector(canvas_id);
        this.gl     = this.canvas.getContext('webgl');

        this.gl.enable(egl.DEPTH_TEST);
    }

    public make_shader(vertex: string, fragment: string) {
        let gl = this.gl;

        let compile = (type, source) => {
            let shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(`compile_error: ${gl.getShaderInfoLog(shader)}`);
            }
            return shader;
        }

        let program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`link error: ${gl.getProgramInfoLog(program)}`);
        }

        return new qr_webgl_shader(gl, program);
    }

    clear() {
        this.gl.clear(egl.COLOR_BUFFER_BIT | egl.DEPTH_BUFFER_BIT);
    }
}

class qc_app {
    canvas: qr_webgl_canvas;
    shader: qr_webgl_shader;
    debug_widget = new qu_debug_explorer();
    quad: qr_webgl_mesh = qr_webgl_mesh.make_quad();

    init() {
        this.canvas = new qr_webgl_canvas('#canvas');
        // document.body.appendChild(this.canvas.canvas);

        this.shader = this.canvas.make_shader(`
            uniform mat4 projection;
            uniform mat4 view;
            uniform mat4 model;

            attribute vec3 vertex;
            varying vec4 position;
            void main() {
                position = vec4(vertex, 1) * vec4(2, 1, 1, 1);
                gl_Position = vec4(vertex, 1.);
            }`, `
            precision mediump float;
            uniform vec2 viewport_size;

            struct ray { vec3 ori; vec3 dir; };

            bool hit_sphere(const vec3 center, float radius, const ray r) {
                vec3 oc = r.ori - center;
                float a = dot(r.dir, r.dir);
                float b = 2. * dot(oc, r.dir);
                float c = dot(oc, oc) - radius * radius;
                return (b*b - 4.*a*c) > 0.;
            }

            vec3 color(const ray r) {
                if (hit_sphere(vec3(0, 0, -1), .5, r)) {
                    return vec3(1, 0, 0);
                }
                vec3 udir = normalize(r.dir);
                float t = .5 * (udir.y + 1.);
                return mix(vec3(1), vec3(.5,.7,1), t);
            }

            varying vec4 position;
            void main() {
                // gl_FragColor = (position + 1.) * 0.5;
                ray r = ray(vec3(0), vec3(position.xy, -1));
                gl_FragColor.rgb = color(r);
                gl_FragColor.a = 1.;
            }`);

        this.shader.uniforms.viewport_size = new Float32Array([this.canvas.canvas.width, this.canvas.canvas.height]);
    }

    do_update = new qu_attribute(true, this);

    update() {
        this.render();
        requestAnimationFrame(this.update.bind(this));
    }

    draw_lines = new qu_attribute(false, this);
    mesh = new qu_attribute('quad', this);

    render() {
        this.canvas.clear();
        this.shader.draw_mesh(
            this[this.mesh.get_value()], 
            this.draw_lines.get_value() ? 'lines' : 'triangles');
    }

    loop() {
        requestAnimationFrame(this.update.bind(this));
    }
}

let app = new qc_app();
app.init();
app.loop();