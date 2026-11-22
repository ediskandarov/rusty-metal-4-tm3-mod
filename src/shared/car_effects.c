#include "car_effects.h"
#include "tm4/gpu_packet.h"
#include "tm4/main/game.h"
#include "tm4/modules/car.h"

/* 800240b0: translucent textured body in the owner's camera. The port decides
   whether that body is visible; this renderer only emits the supplied face. */
void Tm3DrawEffectBody(struct RegistryDirectory* profile, const Rm4CarEffectFace* context)
{
    (void)profile;
    const CarRenderFace* face = context->face;
    int quad = face->code == 0x2c;
    int count = quad ? 4 : 3;
    size_t size = quad ? sizeof(POLY_FT4) : sizeof(POLY_FT3);
    if (*context->cursor >= context->end || (size_t)(context->end - *context->cursor) < size)
        return;
    Tm4FlatTexturedPacket* base = (void*)*context->cursor;
    base->words.color = context->car->light_level * 0x010101
        | (u32)(face->code | (context->invisible ? 2 : 0)) << 24;
    for (int i = 0; i < count; ++i)
        base->words.vertices[i].xy = context->screen[face->vertices[i]].packed;
    base->packed.uv0_clut.word = face->texture.packed.uv0_clut;
    base->packed.uv1_page.word = face->texture.packed.uv1_page;
    base->packed.uv2 = face->texture.packed.uv2;
    if (quad)
        base->packed.uv3_pad.uv = face->texture.packed.uv3;
    WebSubpixelPacket(base, context->precise, face->vertices, count);
    GpuLinkPacketSized(context->ordering, &base->triangle, size);
    *context->cursor += size;
}

/* 80024764 / 80024f0c: ice over the body, or ice alone on an invisible opponent.
   Local draw-mode packets isolate this untextured layer's blend state. */
void Tm3DrawFrozenOverlay(struct RegistryDirectory* profile, const Rm4CarEffectFace* context)
{
    (void)profile;
    const CarRenderFace* face = context->face;
    int quad = face->code == 0x2c;
    int count = quad ? 4 : 3;
    size_t size = quad ? sizeof(POLY_G4) : sizeof(POLY_G3);
    size_t required = size + 2 * sizeof(DR_TPAGE);
    if (*context->cursor >= context->end || (size_t)(context->end - *context->cursor) < required)
        return;
    DR_TPAGE* restore = (void*)*context->cursor;
    setDrawTPage(restore, 0, GameInfo.dither, 0x20);
    GpuLinkPacketSized(context->ordering, restore, sizeof(*restore));
    *context->cursor += sizeof(*restore);
    u32 light = context->car->light_level;
    u32 intensity = 2 * (light > 127 ? 127 : light);
    u32 white = intensity * 0x010101, cyan = intensity * 0x010100, blue = intensity << 16;
    Tm4GouraudPacket* tint = (void*)*context->cursor;
    u32 shades[4] = { quad ? cyan : white, quad ? blue : cyan, quad ? cyan : blue, white };
    for (int i = 0; i < count; ++i) {
        tint->words.vertices[i].xy = context->screen[face->vertices[i]].packed;
        tint->words.vertices[i].color = shades[i];
    }
    setcode(&tint->triangle, quad ? 0x3a : 0x32);
    WebSubpixelPacket(tint, context->precise, face->vertices, count);
    GpuLinkPacketSized(context->ordering, &tint->triangle, size);
    *context->cursor += size;
    DR_TPAGE* mode = (void*)*context->cursor;
    setDrawTPage(mode, 0, GameInfo.dither, 0x20);
    GpuLinkPacketSized(context->ordering, mode, sizeof(*mode));
    *context->cursor += sizeof(*mode);
}
