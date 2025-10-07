// src/TabBars/TabBar.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TabBarId } from './tab-flags.enum';

export type TabBarDocument = TabBar & Document;

@Schema({ _id: false })
export class TabEntry {
  @Prop({ type: String, enum: Object.values(TabBarId), required: true })
  id!: TabBarId;

  @Prop({ type: Boolean, default: false })
  badge!: boolean;
}
export const TabEntrySchema = SchemaFactory.createForClass(TabEntry);

@Schema({ timestamps: true, collection: 'tab_bars' })
export class TabBar {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  // Keep one array per user; default contains every enum with badge=false
  @Prop({
    type: [TabEntrySchema],
    default: () => Object.values(TabBarId).map((id) => ({ id, badge: false })),
    validate: {
      validator(value: TabEntry[]) {
        const ids = value.map(v => v.id);
        // must include all enums and no duplicates
        const all = Object.values(TabBarId);
        const hasAll = all.every(x => ids.includes(x));
        const unique = new Set(ids).size === ids.length;
        return hasAll && unique;
      },
      message: 'tabs must contain each TabBarId exactly once',
    },
  })
  tabs!: TabEntry[];
}

export const TabBarSchema = SchemaFactory.createForClass(TabBar);

// one document per user
TabBarSchema.index({ user: 1 }, { unique: true });

// normalize (ensure any missing enums added; strip unknowns)
TabBarSchema.pre('save', function (next) {
  const doc = this as TabBarDocument;
  const want = new Set(Object.values(TabBarId));
  const byId = new Map(doc.tabs.map(t => [t.id, t]));
  // add missing
  for (const id of want) if (!byId.has(id)) byId.set(id, { id, badge: false } as any);
  // keep only known + one of each
  doc.tabs = Array.from(byId.values())
    .filter(t => want.has(t.id))
    .map(t => ({ id: t.id, badge: !!t.badge })) as any;
  next();
});
