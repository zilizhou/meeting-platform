<template>
  <div class="rte" :class="{ disabled }">
    <Toolbar
      class="rte-toolbar"
      :editor="editorRef"
      :default-config="toolbarConfig"
      :mode="mode"
    />
    <Editor
      class="rte-body"
      :style="{ height }"
      v-model="html"
      :default-config="editorConfig"
      :mode="mode"
      @onCreated="onCreated"
    />
  </div>
</template>

<script setup lang="ts">
import '@wangeditor/editor/dist/css/style.css'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    height?: string
    disabled?: boolean
  }>(),
  {
    modelValue: '',
    placeholder: '请输入议题内容…',
    height: '280px',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = shallowRef<IDomEditor>()
const html = shallowRef(props.modelValue || '')
const mode = 'default'

const toolbarConfig: Partial<IToolbarConfig> = {
  excludeKeys: [
    'group-video',
    'insertVideo',
    'uploadVideo',
    'uploadImage',
    'fullScreen',
    'codeBlock',
    'todo',
  ],
}

const editorConfig: Partial<IEditorConfig> = {
  placeholder: props.placeholder,
  readOnly: props.disabled,
}

function onCreated(editor: IDomEditor) {
  editorRef.value = editor
  if (props.modelValue && editor.getHtml() !== props.modelValue) {
    editor.setHtml(props.modelValue)
  }
  if (props.disabled) editor.disable()
}

watch(
  () => props.modelValue,
  (v) => {
    const next = v || ''
    if (next === html.value) return
    html.value = next
    const editor = editorRef.value
    if (editor && editor.getHtml() !== next) {
      editor.setHtml(next || '<p><br></p>')
    }
  },
)

watch(html, (v) => {
  emit('update:modelValue', v || '')
})

watch(
  () => props.disabled,
  (off) => {
    const editor = editorRef.value
    if (!editor) return
    if (off) editor.disable()
    else editor.enable()
  },
)

onBeforeUnmount(() => {
  const editor = editorRef.value
  if (!editor) return
  editor.destroy()
})
</script>

<style scoped>
.rte {
  border: 1px solid var(--line, #d8e0ea);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.rte.disabled {
  opacity: 0.75;
}
.rte-toolbar {
  border-bottom: 1px solid var(--line, #e5ebf3);
  background: #f7f9fc;
}
.rte-body {
  overflow-y: auto;
}
.rte :deep(.w-e-text-container) {
  background: #f7f9fc !important;
}
.rte :deep(.w-e-text-placeholder) {
  color: #9aa8bc;
  font-style: normal;
}
.rte :deep(.w-e-toolbar) {
  background: transparent;
}
</style>
