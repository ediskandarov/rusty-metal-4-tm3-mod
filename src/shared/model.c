#include "tm3/resources.h"
#include "tm4/gpu_packet.h"
#include "tm4/main/render.h"
#include <psyz/gte.h>
#include <stdint.h>
#include <string.h>

static int front_facing(u_long a, u_long b, u_long c)
{
    s32 ax = (s16)a, ay = (s16)(a >> 16), bx = (s16)b, by = (s16)(b >> 16), cx = (s16)c,
        cy = (s16)(c >> 16);
    return (int64_t)(bx - ax) * (cy - ay) - (int64_t)(by - ay) * (cx - ax) > 0;
}

/* TM3 8002b128: intact mesh, neutral texture modulation and one depth bucket per head. */
void Tm3DisplayCarGroups(Car* car, s32 association, const MATRIX* local_to_world,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    MATRIX camera;
    CompMatrix(view, (MATRIX*)local_to_world, &camera);
    PushMatrix();
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    SVECTOR zero = { 0 };
    u_long xy;
    int perspective, flags;
    s32 depth = RotTransPers(&zero, (int*)&xy, &perspective, &flags);
    if (depth <= 0) {
        PopMatrix();
        return;
    }
    ClampOTDepth(depth);
    const CarRenderList* list = &car->display_lists[0];
    for (s32 group_index = 0; group_index < list->group_count; ++group_index) {
        const CarRenderGroupEntry* entry = &list->groups[group_index];
        if (entry->wheel != association)
            continue;
        const CarRenderFrame* frame = &entry->group->frames[0];
        u_long projected[256];
        if (frame->vertex_count < 0 || frame->vertex_count > 256)
            continue;
        for (s32 i = 0; i < frame->vertex_count; ++i)
            RotTransPers(
                car->vertices + frame->first_vertex + i, (int*)&projected[i], &perspective, &flags);
        const CarRenderFace* face = car->faces + frame->first_face;
        for (s32 i = 0; i < frame->face_count; ++i, ++face) {
            s32 count = face->code == 0x24 ? 3 : face->code == 0x2c ? 4 : 0;
            if (!count)
                continue;
            s32 valid = 1;
            for (s32 v = 0; v < count; ++v)
                if (face->vertices[v] >= frame->vertex_count)
                    valid = 0;
            if (!valid)
                continue;
            const u8* indices = face->vertices;
            if (!face->double_sided
                && !front_facing(
                    projected[indices[0]], projected[indices[1]], projected[indices[2]])
                && (count != 4
                    || !front_facing(
                        projected[indices[3]], projected[indices[1]], projected[indices[2]])))
                continue;
            s32 size = count == 3 ? sizeof(POLY_FT3) : sizeof(POLY_FT4);
            if (*cursor + size >= limit) {
                PopMatrix();
                return;
            }
            Tm4FlatTexturedPacket* packet = (void*)*cursor;
            packet->words.color = 0x808080 | ((u32)face->code << 24);
            for (s32 v = 0; v < count; ++v)
                packet->words.vertices[v].xy = projected[indices[v]];
            packet->packed.uv0_clut.word = face->texture.packed.uv0_clut;
            packet->packed.uv1_page.word = face->texture.packed.uv1_page;
            packet->packed.uv2 = face->texture.packed.uv2;
            if (count == 4)
                packet->packed.uv3_pad.uv = face->texture.packed.uv3;
            GpuLinkPacketSized(ordering + depth, &packet->quad, size);
            *cursor += size;
        }
    }
    PopMatrix();
}

s32 Tm3ScreenClip(u_long a, u_long b, u_long c)
{
    Psyz_GteDataWrite(12, a);
    Psyz_GteDataWrite(13, b);
    Psyz_GteDataWrite(14, c);
    Psyz_GteCommand(6); /* NCLIP, the operation used by PsyZ NormalClip. */
    u32 bits = Psyz_GteDataRead(24);
    return bits <= INT32_MAX ? (s32)bits : -1 - (s32)(UINT32_MAX - bits);
}

/* TM3 8002977c: per-face neutral-shaded FT3/FT4 packets. Geometry belongs to
   the shared pack, while the matrix and texture variant belong to the attack. */
void Tm3DisplayWeaponGeometry(const Tm3WeaponGeometry* mesh, u32 descriptor, u32 variant,
    unsigned texture_bank, s32 tint, const MATRIX* local_to_world, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view)
{
    Tm3WeaponGroup group;
    if (!Tm3WeaponGroupRead(mesh, descriptor, &group))
        return;
    /* The original reserves every face as a quad before projecting. */
    if (*cursor >= limit
        || (size_t)(limit - *cursor) <= (size_t)group.face_count * sizeof(POLY_FT4))
        return;
    MATRIX camera;
    CompMatrix(view, (MATRIX*)local_to_world, &camera);
    PushMatrix();
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    u_long projected[256];
    u32 depths[256];
    for (u32 i = 0; i < group.vertex_count; ++i) {
        SVECTOR vertex = { 0 };
        Tm3WeaponVertexRead(mesh, &group, i, &vertex.vx);
        int perspective, flags;
        RotTransPers(&vertex, (int*)&projected[i], &perspective, &flags);
        depths[i] = Psyz_GteDataRead(19);
    }
    for (u32 i = 0; i < group.face_count; ++i) {
        Tm3WeaponFace face;
        if (!Tm3WeaponFaceRead(mesh, &group, i, variant, &face))
            continue;
        const u8* v = face.vertices;
        s32 quad = (face.command & ~2) == 0x2c;
        s32 depth = (depths[v[0]] + depths[v[1]] + depths[v[2]] + depths[v[quad ? 3 : 0]]) >> 4;
        if (depth < 41)
            continue;
        if (!face.double_sided
            && Tm3ScreenClip(projected[v[0]], projected[v[1]], projected[v[2]]) <= 0
            && (!quad || Tm3ScreenClip(projected[v[3]], projected[v[1]], projected[v[2]]) > 0))
            continue;
        ClampOTDepth(depth);
        s32 size = quad ? sizeof(POLY_FT4) : sizeof(POLY_FT3);
        Tm4FlatTexturedPacket* packet = (void*)*cursor;
        packet->words.color
            = (tint < 0 ? face.shade * 0x010101u : (u32)tint) | (u32)face.command << 24;
        for (s32 n = 0; n < (quad ? 4 : 3); ++n)
            packet->words.vertices[n].xy = projected[v[n]];
        memcpy(&packet->packed.uv0_clut.word, face.texture, 4);
        memcpy(&packet->packed.uv1_page.word, face.texture + 4, 4);
        memcpy(&packet->packed.uv2, face.texture + 8, 2);
        packet->packed.uv1_page.word |= texture_bank << (16 + 9);
        if (quad)
            memcpy(&packet->packed.uv3_pad.uv, face.texture + 10, 2);
        GpuLinkPacketSized(ordering + depth, &packet->quad, size);
        *cursor += size;
    }
    PopMatrix();
}

/* 8002e3f0 / 8002aa5c: two untextured, additive Gouraud strips. */
void Tm3DisplayMissileTrail(
    const Tm3MissileTrail* trail, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    PushMatrix();
    SetRotMatrix(view);
    SetTransMatrix(view);
    for (u32 segment = 0; segment + 1 < trail->count; ++segment) {
        for (u32 side = 0; side < 2; ++side) {
            if (*cursor >= limit
                || (size_t)(limit - *cursor) <= sizeof(POLY_G4) + sizeof(DR_TPAGE)) {
                PopMatrix();
                return;
            }
            SVECTOR vertices[4];
            u32 colors[4];
            Tm3MissileTrailQuad(trail, segment, side, vertices, colors);
            int perspective, flags;
            u_long xy[4];
            s32 depth = 0;
            for (s32 i = 0; i < 4; ++i)
                depth = RotTransPers(&vertices[i], (int*)&xy[i], &perspective, &flags);
            if (depth < 9)
                continue;
            depth = depth > 64 ? depth - 64 : 0;
            ClampOTDepth(depth);
            Tm4GouraudPacket* packet = (void*)*cursor;
            for (s32 i = 0; i < 4; ++i) {
                packet->words.vertices[i].color = colors[i];
                packet->words.vertices[i].xy = xy[i];
            }
            packet->words.vertices[0].color |= 0x3a000000;
            GpuLinkPacketSized(ordering + depth, &packet->quad, sizeof(POLY_G4));
            *cursor += sizeof(POLY_G4);
            /* Original draw mode selects additive blending (ABR=1). Its OT
               insertion precedes the quad at GPU execution time. */
            DR_TPAGE* page = (void*)*cursor;
            page->code[0] = 0xe1000020;
            GpuLinkPacketSized(ordering + depth, page, sizeof(*page));
            *cursor += sizeof(*page);
        }
    }
    PopMatrix();
}
