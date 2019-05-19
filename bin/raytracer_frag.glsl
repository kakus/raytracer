#define FLT_MAX 3.402e+38
#define PI 3.14159265359

precision mediump float;

varying vec4 position;

uniform float u_frame;
uniform float u_time;
uniform float u_rays_per_pixel;
uniform vec2  u_viewport_size;
uniform float u_fov;
uniform mat4  u_view;
uniform float u_lens;
uniform int  u_spheres_num;

uniform sampler2D u_prev;
uniform sampler2D u_spheres_tex;

float g_rand_idx = 1.;
float rand() {
    const float a = 12.9898, b = 78.233, c = 43758.5453;
    float dt = dot( fract(gl_FragCoord.xy * (g_rand_idx += .001) + (u_time/1000.)), vec2( a, b ) ), 
    // highp float dt = dot( gl_FragCoord.xy, vec2( a, b ) ), 
                sn = mod( dt, PI );
    return fract(sin(sn) * c);
}

vec2 randv2(float length) {
    return vec2(rand(), rand()) * 2. * length - length;
}
vec3 randv3(float length) {
    return vec3(rand(), rand(), rand()) * 2. * length - length;
}

vec3 rand_point_in_sphere() {
    // vec3 r = randv3(1.);
    // return normalize(r) * pow(rand(), 1./3.);
    return normalize(randv3(1.));
    // return randv3(.5);
}

vec2 rand_point_on_circle() {
    float alpha = rand() * PI;
    return vec2(sin(alpha), cos(alpha));
}

struct ray_t { vec3 ori; vec3 dir; };

vec3 ray_point(const ray_t r, float t) {
    return r.ori + t * r.dir;
}

struct material_t {
    int  type;
    vec3 albedo;
    float fuz; // for metal
};

struct hit_result_t {
    float t; //time
    vec3  p; //point
    vec3  n; //normal
    material_t m;
};

struct sphere_t {
    vec3 center; 
    float radius;
    material_t material;
};


#define SPHERE_STRUCT_SIZE 6.0

vec3 get_sphere_data(float idx, float prop) {
    return texture2D(u_spheres_tex, vec2((idx * SPHERE_STRUCT_SIZE + prop + 0.5) / (float(u_spheres_num) * SPHERE_STRUCT_SIZE), 0)).rgb;
}

vec3 get_sphere_pos(float idx) {
    return get_sphere_data(idx, 0.);
}

float get_sphere_radius(float idx) {
    return get_sphere_data(idx, 1.).r;
}

material_t get_sphere_material(float idx) {
    material_t m;
    m.type   = int(get_sphere_data(idx, 2.).r);
    m.albedo = get_sphere_data(idx, 3.);
    m.fuz    = get_sphere_data(idx, 4.).r;
    return m;
}

bool sphere_hit(float idx, const ray_t r, float tmin, float tmax, out hit_result_t hit) {
    vec3 center = get_sphere_pos(idx);
    float radius = get_sphere_radius(idx);
    vec3 oc = r.ori - center;
    float a = dot(r.dir, r.dir);
    float b = 2. * dot(oc, r.dir);
    float c = dot(oc, oc) - radius * radius;
    float det = b*b - 4.*a*c; 

    bool b_hit = false;
    if (det > 0.) {
        float tmp = (-b - sqrt(det))/(2.*a);

        b_hit = tmp > tmin && tmp < tmax || 
                (tmp = (-b + sqrt(det)) / (2.*a), tmp > tmin && tmp < tmax);

        if (b_hit) {
            hit.t = tmp;
            hit.p = ray_point(r, tmp);
            hit.n = (hit.p - center) / radius;
            hit.m = get_sphere_material(idx);
        }
    }
    return b_hit;
}

bool hit_spheres(const ray_t r, out hit_result_t res) {
    hit_result_t hit;
    bool b_hit = false;
    float t_min = 0.001;
    float t_max = FLT_MAX;

    for (int i = 0; i < 128; ++i) {
        if (i == u_spheres_num) {
            break;
        }
        if (sphere_hit(float(i), r, t_min, t_max, hit)) {
            t_max = hit.t;
            res   = hit;
            b_hit = true;
        }
    }

    return b_hit;
}

float schlick(float cosine, float ref_idx) {
    float r0 = (1. - ref_idx) / (1. + ref_idx);
    r0 = r0 * r0;
    return r0 + (1. - r0) * pow(1. - cosine, 5.);
}

vec3 scatter(inout ray_t r, const hit_result_t hit) {
    // lambertian
    if (hit.m.type == 0) {
        vec3 target = hit.p + hit.n + rand_point_in_sphere();
        r = ray_t(hit.p, target - hit.p);
        return hit.m.albedo;
    }
    // metal
    else if (hit.m.type == 1) {
        vec3 t = reflect(normalize(r.dir), hit.n);
        r = ray_t(hit.p, t + rand_point_in_sphere() * hit.m.fuz);
        return hit.m.albedo;
    }
    // diaelectric (glass)
    else if (hit.m.type == 2) {
        vec3 n = hit.n;
        const float ref_idx = 1.45;
        float ni = 1. / ref_idx;
        float hit_dot = dot(r.dir, hit.n);
        float cosine = -hit_dot / length(r.dir);

        if (hit_dot > 0.) {
            n = -n;
            ni = 1. / ni;
            cosine *= -ref_idx;
        }

        vec3 refracted = refract(r.dir, n, ni);
        if (dot(refracted, refracted) != 0.) {
            if (rand() > schlick(cosine, ref_idx)) {
                r = ray_t(hit.p, refracted);
                return hit.m.albedo;
            }
        }

        r = ray_t(hit.p, reflect(normalize(r.dir), hit.n));
        return hit.m.albedo;
    }
    return vec3(0);
}

vec3 color(ray_t r) {
    hit_result_t hit;
    vec3 attenuation = vec3(1);
    vec3 color = vec3(0);

    for (int i = 0; i < 8; ++i) {
        if (hit_spheres(r, hit)) {
            attenuation *= scatter(r, hit);
        }
        else {
            vec3 udir = normalize(r.dir);
            float t = .5 * (udir.y + 1.);
            color = mix(vec3(1), vec3(.5,.7,1), t);
            break;
        }
    }

    return color * attenuation;
}

void main() {
    vec2 inv_size = 1. / u_viewport_size;
    vec3 cam_pos = (u_view * vec4(0, 0, 0, 1)).xyz;
    int passes  = int(u_rays_per_pixel);

    float h = 0.5 / tan(radians(u_fov));

    for (int i = 0; i < 128; ++i) {
        vec2 lens = rand_point_on_circle() * rand() * u_lens;
        vec3 lens_p = (u_view * vec4(lens, 0, 0)).xyz;
        vec4 dir = u_view * vec4(position.xy + randv2(.9) * inv_size, -h, 0);
        ray_t r = ray_t(cam_pos + lens_p, dir.xyz - lens_p);
        gl_FragColor.rgb += color(r);
        if (--passes == 0) {
            gl_FragColor.rgb /= u_rays_per_pixel;
            break;
        }
        if (u_frame > 1.) {
            break;
        }
    }

    gl_FragColor.rgb = sqrt(gl_FragColor.rgb);

    if (u_frame > 1.) {
        gl_FragColor.rgb /= u_frame;
        gl_FragColor.rgb += (u_frame - 1.) * texture2D(u_prev, gl_FragCoord.xy/u_viewport_size).rgb / u_frame;
    }
    // if (gl_FragCoord.y < 10.)
    // gl_FragColor.rgb = texture2D(u_spheres_tex, gl_FragCoord.xy/u_viewport_size).rgb;
    // gl_FragColor.rg = gl_FragCoord.xy / u_viewport_size;
    gl_FragColor.a = 1.;
}