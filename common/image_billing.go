package common

const (
	ImageObservedBasePriceUSD = 0.201
	ImageFallbackBasePriceUSD = 0.25
	ImagePublicMultiplier     = 0.3
	ImageBillingFXCNYPerUSD   = 6.74
	ImageDefaultPriceUSD      = ImageObservedBasePriceUSD * ImagePublicMultiplier / ImageBillingFXCNYPerUSD
	ImageFallbackPriceUSD     = ImageFallbackBasePriceUSD * ImagePublicMultiplier / ImageBillingFXCNYPerUSD
)
