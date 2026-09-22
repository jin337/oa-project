$baseUrl = "http://localhost:8180/api/v1"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6ImFkbWluIiwiaXNzIjoiYmFjay1lbmQiLCJleHAiOjE3OTAwNjQxMzAsImlhdCI6MTc4OTk3NzczMH0.liuaYo4FRft8uKVC-FWgkMMXr3yy3sMPBUNnUlEVado"
$appId = 3
$tableName = "project_init"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$fields = @(
    @{name="project_intro"; type="text"; comment="项目简介"},
    @{name="project_source"; type="varchar"; length=255; comment="项目信息来源"},
    @{name="project_name"; type="varchar"; length=255; comment="项目暂定名称"},
    @{name="project_unit"; type="varchar"; length=255; comment="项目拟发包单位"},
    @{name="bid_method"; type="varchar"; length=64; comment="拟定标方式"},
    @{name="unit_nature"; type="varchar"; length=64; comment="拟发包单位性质"},
    @{name="build_location"; type="varchar"; length=255; comment="建设地点"},
    @{name="project_amount"; type="decimal"; length="18,2"; comment="项目预计金额(含税)"},
    @{name="budget_amount"; type="decimal"; length="18,2"; comment="商务费用预算总额"},
    @{name="start_date"; type="date"; comment="项目预计开工时间"},
    @{name="end_date"; type="date"; comment="项目预计竣工时间"},
    @{name="gross_margin"; type="decimal"; length="5,2"; comment="项目预计毛利率(%)"},
    @{name="settlement_terms"; type="text"; comment="项目结算条款及要求"},
    @{name="feasibility"; type="text"; comment="项目可行性分析及项目资质要求"},
    @{name="unit_intro"; type="text"; comment="发包单位情况介绍及资质、资信审核情况"},
    @{name="board_opinion"; type="text"; comment="董事会审批意见"},
    @{name="upload_files"; type="json"; comment="相关文件"}
)

foreach ($field in $fields) {
    $payload = @{
        name = $field.name
        type = $field.type
        comment = $field.comment
        table_name = $tableName
        not_null = 0
        default_value = ""
    }
    if ($field.length) {
        $payload.length = $field.length
    }

    $json = $payload | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri "$baseUrl/application/$appId/fields" -Method Post -Headers $headers -Body $json
    Write-Host "创建 $($field.name): $($response | ConvertTo-Json -Compress)"
}
