################################################################################
# AWS Data Sources — Discover existing network-hub resources
#
# Reads VPC, subnets, and security groups directly from AWS.
# No TFC workspace dependency; single source of truth is AWS.
#
# Filtering: network-hub tags subnets/SGs with Type="app" and Type="data".
# VPC identified by Name tag (e.g. vsrp-sandbox-dev).
################################################################################

# -------------------------------------------------------------------------------
# Current AWS account identity (used for APP_ACCOUNT_ID env var on backend)
# -------------------------------------------------------------------------------
data "aws_caller_identity" "current" {}

# -------------------------------------------------------------------------------
# VPC: lookup by name tag (vsrp-sandbox-dev)
# -------------------------------------------------------------------------------
data "aws_vpc" "spoke" {
  filter {
    name   = "tag:Name"
    values = [local.vpc_name]
  }
}

# -------------------------------------------------------------------------------
# Subnets: all in VPC, then filter by Type tag (app vs data)
# -------------------------------------------------------------------------------
data "aws_subnets" "spoke" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.spoke.id]
  }
}

data "aws_subnet" "spoke" {
  for_each = toset(data.aws_subnets.spoke.ids)
  id       = each.value
}

# -------------------------------------------------------------------------------
# Security groups: fetch all in VPC, filter by Type tag
# -------------------------------------------------------------------------------
data "aws_security_groups" "spoke" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.spoke.id]
  }
}

data "aws_security_group" "spoke" {
  for_each = toset(data.aws_security_groups.spoke.ids)
  id       = each.value
}

# -------------------------------------------------------------------------------
# Locals: VPC name + filtered subnet/SG IDs from AWS
# -------------------------------------------------------------------------------
locals {
  # VPC name for lookup (override via var if needed)
  vpc_name = coalesce(var.vpc_name, "vsrp-sandbox-dev")

  # From data sources
  vpc_id = data.aws_vpc.spoke.id

  # Filter subnets by Type tag from network-hub
  app_subnet_ids = [
    for id, subnet in data.aws_subnet.spoke :
    id
    if try(subnet.tags["Type"], "") == "app"
  ]

  data_subnet_ids = [
    for id, subnet in data.aws_subnet.spoke :
    id
    if try(subnet.tags["Type"], "") == "data"
  ]

  # Filter security groups by Type tag
  app_security_group_id = [
    for id, sg in data.aws_security_group.spoke :
    sg.id
    if try(sg.tags["Type"], "") == "app"
  ][0]

  data_security_group_id = [
    for id, sg in data.aws_security_group.spoke :
    sg.id
    if try(sg.tags["Type"], "") == "data"
  ][0]

  # ---------------------------------------------------------------------------
  # Sandbox config (hardcoded; no variables needed)
  # ---------------------------------------------------------------------------
  alb_allowed_cidrs    = ["10.14.0.0/16"] # On-prem; add Client VPN CIDR when ready
  db_name              = "vsrp_sandbox"
  db_allocated_storage = 20
}
