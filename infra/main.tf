terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  function_name = "${var.project}-auth-${var.environment}"
  route_prefix  = var.environment == "prod" ? "" : "/${var.environment}"
  package       = "${path.module}/../function.zip"
}

data "aws_vpc" "this" {
  filter {
    name   = "tag:Name"
    values = ["${var.project}-vpc"]
  }
}

data "aws_subnets" "this" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.this.id]
  }
}

data "aws_apigatewayv2_apis" "this" {
  name = "${var.project}-api"
}

resource "aws_iam_role" "lambda" {
  name = local.function_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "vpc_access" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_security_group" "lambda" {
  name        = local.function_name
  description = "Outbound access for the authentication function"
  vpc_id      = data.aws_vpc.this.id

  egress {
    description = "PostgreSQL inside the VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.this.cidr_block]
  }
}

resource "aws_lambda_function" "auth" {
  function_name    = local.function_name
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  handler          = "handler.handler"
  filename         = local.package
  source_code_hash = filebase64sha256(local.package)
  timeout          = 10
  memory_size      = 256

  vpc_config {
    subnet_ids         = data.aws_subnets.this.ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      JWT_SECRET   = var.jwt_secret
      DATABASE_URL = var.database_url
      DATABASE_SSL = "true"
    }
  }

  depends_on = [aws_iam_role_policy_attachment.vpc_access]
}

resource "aws_apigatewayv2_integration" "auth" {
  api_id                 = one(data.aws_apigatewayv2_apis.this.ids)
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.auth.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "auth" {
  api_id    = one(data.aws_apigatewayv2_apis.this.ids)
  route_key = "POST ${local.route_prefix}/auth/customer"
  target    = "integrations/${aws_apigatewayv2_integration.auth.id}"
}

data "aws_apigatewayv2_api" "this" {
  api_id = one(data.aws_apigatewayv2_apis.this.ids)
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${data.aws_apigatewayv2_api.this.execution_arn}/*/*"
}
