variable "region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "oficina"
}

variable "environment" {
  type = string

  validation {
    condition     = contains(["hml", "prod"], var.environment)
    error_message = "Environment must be hml or prod."
  }
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "database_url" {
  type      = string
  sensitive = true
}

output "function_name" {
  value = aws_lambda_function.auth.function_name
}

output "route" {
  value = aws_apigatewayv2_route.auth.route_key
}
