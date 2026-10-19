import { Button, Card, Message, Space, Tabs } from '@arco-design/web-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as applicationApi from 'src/api/application'
import * as deptApi from 'src/api/dept'
import { listExamineGroups } from 'src/api/examineGroup'
import { fetchAll } from 'src/api/fetchAll'
import * as roleApi from 'src/api/role'
import ExamineManage from 'src/pages/application/design/ExamineManage'
import LayoutManage from 'src/pages/application/design/LayoutManage.jsx'
import { transformDeptTree, transformRoleList } from 'src/pages/application/examine/flowModel'

const TabPane = Tabs.TabPane

/**
 * 表单设计统一入口：
 * - 外层 Card 标题「流程名 - 表单设计」，右上角「保存 / 发布」；
 * - Tabs 居中，区分「表单设置布局」与「审批管理」；
 * - 所有接口请求（流程详情 / 表单元素 / 组织架构 / 角色 / 审核人员组）统一在此发起，
 *   下发给两个子组件，子组件不再各自请求。
 */
export default function DesignManage() {
  const { id } = useParams()
  const [app, setApp] = useState(null)
  const [elements, setElements] = useState([])
  const [orgTree, setOrgTree] = useState([])
  const [roleList, setRoleList] = useState([])
  const [examineGroups, setExamineGroups] = useState([])
  const [saving, setSaving] = useState(false)
  const layoutRef = useRef(null)
  const examineRef = useRef(null)

  // 拉取表单元素列表（子组件共用）
  const loadElements = useCallback(async () => {
    const res = await fetchAll((p) => applicationApi.listApplicationElements(id, p))
    const list = res.data?.list || []
    setElements(list)
    return list
  }, [id])

  // 流程详情
  useEffect(() => {
    if (!id) return
    let cancelled = false
    applicationApi
      .getApplication(id)
      .then((res) => {
        if (!cancelled) setApp(res.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id])

  // 表单元素
  useEffect(() => {
    if (!id) return
    loadElements().catch(() => {})
  }, [id, loadElements])

  // 组织架构 / 角色 / 审核人员组（审批选择器共用，全局只需一次）
  useEffect(() => {
    let cancelled = false
    Promise.all([
      deptApi.getDeptUsersTree({ status: 1 }),
      fetchAll(roleApi.listRoles, { status: 1 }),
      fetchAll(listExamineGroups, { status: 1 }),
    ])
      .then(([deptRes, roleRes, groupRes]) => {
        if (cancelled) return
        setOrgTree(transformDeptTree(deptRes.data?.list || deptRes.data || []))
        setRoleList(transformRoleList(roleRes.data?.list || roleRes.data || []))
        const groupList = groupRes.data?.list || groupRes.data || []
        setExamineGroups(Array.isArray(groupList) ? groupList : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      // 依次保存布局与审批流；任一失败都会抛错，由请求层提示
      await layoutRef.current?.save()
      await examineRef.current?.save()
      Message.success('保存成功')
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = () => {
    Message.info('发布（待接入：生成版本快照并生效）')
  }

  return (
    <Card
      title={`${app?.name ? app.name + ' - ' : ''}表单设计`}
      extra={
        <Space>
          <Button loading={saving} onClick={handleSave}>
            保存
          </Button>
          <Button type="primary" onClick={handlePublish}>
            发布
          </Button>
        </Space>
      }
      bordered={false}
    >
      <Tabs
        defaultActiveKey="layout"
        type="line"
        className="design-tabs [&_.arco-tabs-header-nav]:justify-center"
      >
        <TabPane key="layout" title="表单设置布局">
          <LayoutManage
            ref={layoutRef}
            id={id}
            app={app}
            elements={elements}
            onRefreshElements={loadElements}
          />
        </TabPane>
        <TabPane key="examine" title="审批管理">
          <ExamineManage
            ref={examineRef}
            id={id}
            app={app}
            formFields={elements}
            orgTree={orgTree}
            roleList={roleList}
            examineGroups={examineGroups}
          />
        </TabPane>
      </Tabs>
    </Card>
  )
}
