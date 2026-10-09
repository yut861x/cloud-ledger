<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { money } from './lib/ledger'

const props = defineProps({
  type: { type: String, required: true },
  groups: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

const canvas = ref(null)
const title = computed(() => props.type === 'expense' ? '支出饼图' : '收入饼图')
const total = computed(() => props.groups.reduce((sum, group) => sum + group.amount, 0))
const description = computed(() => props.loading ? `${title.value}：正在统计`
  : props.groups.length
    ? `${title.value}：${props.groups.map((group) => `${group.name} ${group.percent.toFixed(1)}%`).join('，')}`
    : `${title.value}：本月暂无数据`)

function rgb(hex) {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
}

function draw() {
  const context = canvas.value?.getContext('2d')
  if (!context) return
  const { width, height } = context.canvas
  const image = context.createImageData(width, height)
  const center = 53
  const radius = 46
  const outline = rgb('#51463d')
  const shadow = rgb('#e9dfd4')
  const empty = rgb('#e8e2da')
  const colors = props.groups.map((group) => rgb(group.color))
  const cumulative = []
  let share = 0
  for (const group of props.groups) {
    share += group.amount / total.value
    cumulative.push(share)
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - center
      const dy = y - center
      const distance = dx * dx + dy * dy
      const shadowDx = x - center - 5
      const shadowDy = y - center - 6
      const inShadow = shadowDx * shadowDx + shadowDy * shadowDy <= radius * radius
      if (!inShadow && distance > radius * radius) continue
      let color = shadow
      if (distance <= radius * radius) {
        if (distance >= (radius - 2) * (radius - 2)) color = outline
        else if (!colors.length) color = empty
        else {
          const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)
          const portion = angle / (Math.PI * 2)
          const index = cumulative.findIndex((limit) => portion < limit)
          color = colors[index < 0 ? colors.length - 1 : index]
        }
      }
      const offset = (y * width + x) * 4
      image.data[offset] = color[0]
      image.data[offset + 1] = color[1]
      image.data[offset + 2] = color[2]
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
}

onMounted(draw)
watch(() => props.groups, draw, { flush: 'post' })
</script>

<template>
  <section class="pixel-pie-card" :aria-label="`${title}分类占比`">
    <div class="pixel-pie-heading">
      <div><span class="pixel-overline">{{ type === 'expense' ? 'SPEND / 01' : 'EARN / 02' }}</span><h2>{{ title }}</h2><p>当前账本 · 本月分类占比</p></div>
      <span class="pixel-stamp">8-BIT</span>
    </div>
    <div class="pixel-pie-content">
      <canvas ref="canvas" width="112" height="112" role="img" :aria-label="description"></canvas>
      <p v-if="loading" class="pixel-pie-empty">正在统计本月分类…</p>
      <div v-else-if="groups.length" class="pixel-pie-legend">
        <div v-for="group in groups" :key="group.name" class="pixel-legend-row">
          <span class="pixel-swatch" :style="{ backgroundColor: group.color }"></span>
          <span class="pixel-legend-name">{{ group.name }}</span>
          <strong>{{ group.percent.toFixed(1) }}%</strong>
          <small>{{ money(group.amount) }}</small>
        </div>
      </div>
      <p v-else class="pixel-pie-empty">本月暂无{{ type === 'expense' ? '支出' : '收入' }}记录<br>记一笔后，像素饼图会在这里出现。</p>
    </div>
    <div class="pixel-pie-total"><span>合计 / TOTAL</span><strong>{{ money(total) }}</strong></div>
  </section>
</template>
