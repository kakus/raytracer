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

uniform sampler2D u_prev;

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

struct ray { vec3 ori; vec3 dir; };

vec3 ray_point(const ray r, float t) {
    return r.ori + t * r.dir;
}

struct tmaterial {
    int  type;
    vec3 albedo;
    float fuz; // for metal
};

struct hit_result {
    float t; //time
    vec3  p; //point
    vec3  n; //normal
    tmaterial m;
};

struct sphere {
    vec3 center; 
    float radius;
    tmaterial material;
};

bool sphere_hit(const sphere self, const ray r, float tmin, float tmax, out hit_result hit) {
    vec3 oc = r.ori - self.center;
    float a = dot(r.dir, r.dir);
    float b = 2. * dot(oc, r.dir);
    float c = dot(oc, oc) - self.radius * self.radius;
    float det = b*b - 4.*a*c; 

    bool b_hit = false;
    if (det > 0.) {
        float tmp = (-b - sqrt(det))/(2.*a);

        b_hit = tmp > tmin && tmp < tmax || 
                (tmp = (-b + sqrt(det)) / (2.*a), tmp > tmin && tmp < tmax);

        if (b_hit) {
            hit.t = tmp;
            hit.p = ray_point(r, tmp);
            hit.n = (hit.p - self.center) / self.radius;
            hit.m = self.material;
        }
    }
    return b_hit;
}

#define SPHERES_NUM 4
sphere spheres[SPHERES_NUM];

bool hit_spheres(const ray r, out hit_result res) {
    hit_result hit;
    bool b_hit = false;
    float t_min = 0.001;
    float t_max = FLT_MAX;

    for (int i = 0; i < SPHERES_NUM; ++i) {
        if (sphere_hit(spheres[i], r, t_min, t_max, hit)) {
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

vec3 scatter(inout ray r, const hit_result hit) {
    // lambertian
    if (hit.m.type == 0) {
        vec3 target = hit.p + hit.n + rand_point_in_sphere();
        r = ray(hit.p, target - hit.p);
        return hit.m.albedo;
    }
    // metal
    else if (hit.m.type == 1) {
        vec3 t = reflect(normalize(r.dir), hit.n);
        r = ray(hit.p, t + rand_point_in_sphere() * hit.m.fuz);
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
                r = ray(hit.p, refracted);
                return hit.m.albedo;
            }
        }

        r = ray(hit.p, reflect(normalize(r.dir), hit.n));
        return hit.m.albedo;
    }
    return vec3(0);
}

bool my_refract(inout vec3 v, const vec3 n, const float ni_over_nt) {
    vec3 uv = normalize(v);
    float dt = dot(uv, n);
    float discriminant = 1. - ni_over_nt * ni_over_nt * (1. - dt * dt);
    if (discriminant > 0.) {
        v = ni_over_nt * (uv - n * dt) - n * sqrt(discriminant);
        return true;
    }
    return false;
}

vec3 color(ray r) {
    hit_result hit;
    vec3 attenuation = vec3(1);
    vec3 color = vec3(0);

    for (int i = 0; i < 8; ++i) {
        if (hit_spheres(r, hit)) {
            vec3 att = vec3(1);
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
    spheres[0] = sphere(vec3( 0, 0, 0), .5, tmaterial(0, vec3(.8, .3, .3), 0.));
    spheres[1] = sphere(vec3(-1.1, 0, 0),                 .5, tmaterial(2, vec3(1., 1., 1.), 0.5));
    spheres[2] = sphere(vec3( 1.1, 0, 0),                 .5, tmaterial(1, vec3(.8, .8, .8), 0.));
    spheres[3] = sphere(vec3(0, -100.5, 0),           100., tmaterial(0, vec3(.8, .8,  0), 0.));

    vec2 inv_size = 1. / u_viewport_size;
    vec3 cam_pos = (u_view * vec4(0, 0, 0, 1)).xyz;
    int passes  = int(u_rays_per_pixel);

    float h = 0.5 / tan(radians(u_fov));

    for (int i = 0; i < 128; ++i) {
        vec2 lens = rand_point_on_circle() * rand() * u_lens;
        vec3 lens_p = (u_view * vec4(lens, 0, 0)).xyz;
        vec4 dir = u_view * vec4(position.xy + randv2(.9) * inv_size, -h, 0);
        ray r = ray(cam_pos + lens_p, dir.xyz - lens_p);
        gl_FragColor.rgb += color(r);
        if (--passes == 0) {
            gl_FragColor.rgb /= u_rays_per_pixel;
            break;
        }
        if (u_frame > 1.) {
            break;
        }
    }

    if (u_frame > 1.) {
        gl_FragColor.rgb /= u_frame;
        gl_FragColor.rgb += (u_frame - 1.) * texture2D(u_prev, gl_FragCoord.xy/u_viewport_size).rgb / u_frame;
    }

    // gl_FragColor.rgb /= float(u_rays_per_pixel);
    // gl_FragColor.rgb = sqrt(gl_FragColor.rgb);
    // gl_FragColor.xyz += vec3(rand(), rand(), rand());
    gl_FragColor.a = 1.;
}