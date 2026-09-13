import { createRouter, createWebHistory } from 'vue-router'
import WorkspaceView from '../views/WorkspaceView.vue'
import DataLayerTestLab from '../views/DataLayerTestLab.vue'
import OperationsTestLab from '../views/OperationsTestLab.vue'
import BackupView from '../views/BackupView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'workspace',
      component: WorkspaceView,
      meta: { title: 'Nexora｜知域', workspace: true },
    },
    {
      path: '/test-lab',
      name: 'test-lab',
      component: DataLayerTestLab,
      meta: { title: 'Nexora · Data Layer Test Lab' },
    },
    {
      path: '/operation-lab',
      name: 'operation-lab',
      component: OperationsTestLab,
      meta: { title: 'Nexora · Operations Test Lab' },
    },
    {
      path: '/backup',
      name: 'backup',
      component: BackupView,
      meta: { title: 'Nexora · 备份与导入' },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const title = to.meta.title
  document.title = typeof title === 'string' ? title : 'Nexora｜知域'
})

export default router
