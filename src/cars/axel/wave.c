#include "module_import.h"
#include "special.h"
#include "tm4/main/object.h"

void Tm3SpawnAxelWave(Car* car)
{
    /* TM3 averages the velocities of its final two upper body atoms. TM4
       represents the sprung body with its central particle. */
    const CarParticle* body = car->particle_end - 1;
    int32_t velocity[3] = { body->velocity_q12.vx, body->velocity_q12.vy, body->velocity_q12.vz };
    int16_t forward[3] = { car->transform.m[0][2], car->transform.m[1][2], car->transform.m[2][2] };
    Tm3ExplosionSettings settings = {
        .position = { car->transform.t[0], car->transform.t[1] - 20, car->transform.t[2], 0 },
        .rotation = &car->transform,
        .material = Tm3AxelMaterial,
        .color = 0x808080,
        .height = 40,
        .speed = 200,
        .duration = 15,
        .radial_force = 2048,
        .lift = 1940,
        .owner = car,
        .source = ObjectGetHeader(car)->participant,
        .once_per_car = 1,
    };
    WEB_MODULE("mtm3fx.sym", Tm3BodyForwardStep)(forward, velocity, settings.step);
    WEB_MODULE("mtm3fx.sym", Tm3SpawnExplosion)(&settings);
}
