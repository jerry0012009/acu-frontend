package common

import "github.com/go-playground/validator/v10"

var Validate *validator.Validate

func init() {
	Validate = validator.New()
	if err := Validate.RegisterValidation("password", func(field validator.FieldLevel) bool {
		return IsValidNewPassword(field.Field().String())
	}); err != nil {
		panic(err)
	}
}
