#include "car_status_effects.h"
#include "module_import.h"
#include "tm3/missile.h"
#include "tm4/gpu_packet.h"

void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);

static s32 launch(Car* car, CarWeaponInstance* weapon, s32 rear)
{
    MATRIX transform;
    SVECTOR inherited;
    Car* target
        = WEB_MODULE("car", CarPrepareProjectileLaunch)(car, weapon, rear, &transform, &inherited);
    return Tm3MissileLaunch(NULL, car, target, &transform, rear, 3, 0, 0xd00000) != NULL;
}

/* 800240b0 draws the translucent textured body for its own camera.
   80024764 draws texture then ice. 80024f0c draws just the ice when another
   camera observes an invisible frozen car. Ordering-table insertion is LIFO. */
static void draw_face(const Car* car, int draw_body, const CarRenderFace* face,
    const Tm4ScreenPoint* screen, const PsyzSubpixelPosition* precise, Tm4OrderingTag* ordering,
    u8** cursor, u8* end)
{
    int quad = face->code == 0x2c;
    int count = quad ? 4 : 3;
    int invisible = car->invisibility_ticks > 0;
    size_t overlay_size = quad ? sizeof(POLY_G4) : sizeof(POLY_G3);
    size_t texture_size = quad ? sizeof(POLY_FT4) : sizeof(POLY_FT3);
    if (*cursor >= end
        || (size_t)(end - *cursor)
            < (car->freeze_ticks ? overlay_size : 0) + (draw_body ? texture_size : 0))
        return;
    u32 light = car->light_level;
    if (car->freeze_ticks) {
        u32 intensity = 2 * (light > 127 ? 127 : light);
        u32 white = intensity * 0x010101, cyan = intensity * 0x010100, blue = intensity << 16;
        Tm4GouraudPacket* tint = (void*)*cursor;
        u32 shades[4] = { quad ? cyan : white, quad ? blue : cyan, quad ? cyan : blue, white };
        for (int i = 0; i < count; ++i) {
            tint->words.vertices[i].xy = screen[face->vertices[i]].packed;
            tint->words.vertices[i].color = shades[i];
        }
        setcode(&tint->triangle, quad ? 0x3a : 0x32);
        WebSubpixelPacket(tint, precise, face->vertices, count);
        GpuLinkPacketSized(ordering, &tint->triangle, overlay_size);
        *cursor += overlay_size;
    }
    if (draw_body) {
        Tm4FlatTexturedPacket* base = (void*)*cursor;
        base->words.color = light * 0x010101 | (u32)(face->code | (invisible ? 2 : 0)) << 24;
        for (int i = 0; i < count; ++i)
            base->words.vertices[i].xy = screen[face->vertices[i]].packed;
        base->packed.uv0_clut.word = face->texture.packed.uv0_clut;
        base->packed.uv1_page.word = face->texture.packed.uv1_page;
        base->packed.uv2 = face->texture.packed.uv2;
        if (quad)
            base->packed.uv3_pad.uv = face->texture.packed.uv3;
        WebSubpixelPacket(base, precise, face->vertices, count);
        GpuLinkPacketSized(ordering, &base->triangle, texture_size);
        *cursor += texture_size;
    }
}

/* 8002d208 sets 3.0 Q12; profile 3 (80030fbc) converts seconds to ticks. */
const WebCarStatusEffects Tm3StatusEffects = {
    .freeze_ticks = Tm3FreezeTicks,
    .invisibility_ticks = 180, /* 800188c0 */
    .minimum_light = 32,
    .invisible_page = 0x60, /* 80024714 */
    .launch_freeze = launch,
    .draw_face = draw_face,
};
